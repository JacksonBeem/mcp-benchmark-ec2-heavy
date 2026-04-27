const tensorStore = new Map();

const FUNCTION_NAMES = new Set(["sin", "cos", "tan", "sqrt", "log", "exp", "abs"]);
const CONSTANT_NAMES = {
  pi: "Math.PI",
  e: "Math.E",
};

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function initializationResult() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: {
      name: "scientific_computation_mcp",
      version: "1.0.0",
    },
  };
}

function makeTool(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
    },
  };
}

function makeTextResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function product(values) {
  return values.reduce((acc, value) => acc * value, 1);
}

function inferShape(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.length === 0) {
    return [0];
  }
  const firstShape = inferShape(value[0]);
  for (const item of value.slice(1)) {
    const nextShape = inferShape(item);
    if (JSON.stringify(nextShape) !== JSON.stringify(firstShape)) {
      throw new Error("Tensor rows must be rectangular");
    }
  }
  return [value.length, ...firstShape];
}

function reshape(flat, shape) {
  if (shape.length === 0) {
    return Number(flat[0]);
  }
  if (shape.length === 1) {
    return flat.splice(0, shape[0]).map(Number);
  }
  const size = product(shape.slice(1));
  const result = [];
  for (let index = 0; index < shape[0]; index += 1) {
    result.push(reshape(flat.splice(0, size), shape.slice(1)));
  }
  return result;
}

function createTensor(shape, values) {
  const numericShape = shape.map((value) => Number(value));
  const numericValues = values.map((value) => Number(value));
  if (numericShape.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error("shape must contain positive integers");
  }
  if (product(numericShape) !== numericValues.length) {
    throw new Error("Shape does not match number of values");
  }
  return reshape([...numericValues], numericShape);
}

function getStoredTensor(name) {
  if (!tensorStore.has(name)) {
    throw new Error(`Tensor "${name}" not found`);
  }
  return tensorStore.get(name);
}

function tensorShape(tensor) {
  return inferShape(tensor);
}

function ensureSameShape(a, b) {
  const left = JSON.stringify(tensorShape(a));
  const right = JSON.stringify(tensorShape(b));
  if (left !== right) {
    throw new Error(`Tensor shapes do not match: ${left} vs ${right}`);
  }
}

function mapTensor(tensor, fn) {
  if (!Array.isArray(tensor)) {
    return fn(Number(tensor));
  }
  return tensor.map((item) => mapTensor(item, fn));
}

function combineTensors(a, b, fn) {
  if (!Array.isArray(a) && !Array.isArray(b)) {
    return fn(Number(a), Number(b));
  }
  return a.map((item, index) => combineTensors(item, b[index], fn));
}

function toMatrix(tensor, name = "tensor") {
  const shape = tensorShape(tensor);
  if (shape.length !== 2) {
    throw new Error(`${name} must be a 2D matrix`);
  }
  return tensor.map((row) => row.map((value) => Number(value)));
}

function toVector(tensor, name = "tensor") {
  const shape = tensorShape(tensor);
  if (shape.length !== 1) {
    throw new Error(`${name} must be a 1D vector`);
  }
  return tensor.map((value) => Number(value));
}

function identityMatrix(size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => (row === col ? 1 : 0)),
  );
}

function transposeMatrix(matrix) {
  return matrix[0].map((_, col) => matrix.map((row) => row[col]));
}

function multiplyMatricesArray(a, b) {
  if (a[0].length !== b.length) {
    throw new Error("Matrix dimensions are incompatible for multiplication");
  }
  return a.map((row) =>
    b[0].map((_, col) => row.reduce((sum, value, idx) => sum + value * b[idx][col], 0)),
  );
}

function dot(a, b) {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function norm(vector) {
  return Math.sqrt(dot(vector, vector));
}

function cross(a, b) {
  if (a.length !== 3 || b.length !== 3) {
    throw new Error("Cross product requires 3D vectors");
  }
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function determinant(matrix) {
  const n = matrix.length;
  if (n !== matrix[0].length) {
    throw new Error("Matrix must be square");
  }
  const work = matrix.map((row) => [...row]);
  let det = 1;

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    while (pivot < n && Math.abs(work[pivot][col]) < 1e-12) {
      pivot += 1;
    }
    if (pivot === n) {
      return 0;
    }
    if (pivot !== col) {
      [work[pivot], work[col]] = [work[col], work[pivot]];
      det *= -1;
    }
    const pivotValue = work[col][col];
    det *= pivotValue;
    for (let row = col + 1; row < n; row += 1) {
      const factor = work[row][col] / pivotValue;
      for (let inner = col; inner < n; inner += 1) {
        work[row][inner] -= factor * work[col][inner];
      }
    }
  }

  return det;
}

function inverseMatrix(matrix) {
  const n = matrix.length;
  if (n !== matrix[0].length) {
    throw new Error("Matrix must be square");
  }
  const work = matrix.map((row, index) => [...row, ...identityMatrix(n)[index]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    while (pivot < n && Math.abs(work[pivot][col]) < 1e-12) {
      pivot += 1;
    }
    if (pivot === n) {
      throw new Error("Matrix is singular and cannot be inverted");
    }
    if (pivot !== col) {
      [work[pivot], work[col]] = [work[col], work[pivot]];
    }
    const pivotValue = work[col][col];
    for (let inner = 0; inner < 2 * n; inner += 1) {
      work[col][inner] /= pivotValue;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = work[row][col];
      for (let inner = 0; inner < 2 * n; inner += 1) {
        work[row][inner] -= factor * work[col][inner];
      }
    }
  }

  return work.map((row) => row.slice(n));
}

function rankMatrix(matrix) {
  const work = matrix.map((row) => [...row]);
  const rows = work.length;
  const cols = work[0].length;
  let rank = 0;
  let pivotRow = 0;

  for (let col = 0; col < cols && pivotRow < rows; col += 1) {
    let pivot = pivotRow;
    while (pivot < rows && Math.abs(work[pivot][col]) < 1e-12) {
      pivot += 1;
    }
    if (pivot === rows) {
      continue;
    }
    [work[pivot], work[pivotRow]] = [work[pivotRow], work[pivot]];
    const pivotValue = work[pivotRow][col];
    for (let inner = col; inner < cols; inner += 1) {
      work[pivotRow][inner] /= pivotValue;
    }
    for (let row = 0; row < rows; row += 1) {
      if (row === pivotRow) {
        continue;
      }
      const factor = work[row][col];
      for (let inner = col; inner < cols; inner += 1) {
        work[row][inner] -= factor * work[pivotRow][inner];
      }
    }
    rank += 1;
    pivotRow += 1;
  }

  return rank;
}

function column(matrix, index) {
  return matrix.map((row) => row[index]);
}

function setColumn(matrix, index, values) {
  values.forEach((value, row) => {
    matrix[row][index] = value;
  });
}

function gramSchmidt(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const q = Array.from({ length: rows }, () => Array(cols).fill(0));
  const r = Array.from({ length: cols }, () => Array(cols).fill(0));

  for (let colIndex = 0; colIndex < cols; colIndex += 1) {
    let v = column(matrix, colIndex);
    for (let inner = 0; inner < colIndex; inner += 1) {
      const qCol = column(q, inner);
      r[inner][colIndex] = dot(qCol, v);
      v = v.map((value, idx) => value - r[inner][colIndex] * qCol[idx]);
    }
    r[colIndex][colIndex] = norm(v);
    if (r[colIndex][colIndex] > 1e-12) {
      const normalized = v.map((value) => value / r[colIndex][colIndex]);
      setColumn(q, colIndex, normalized);
    }
  }

  return { q, r };
}

function jacobiEigenSymmetric(matrix, maxIterations = 100) {
  const n = matrix.length;
  let a = matrix.map((row) => [...row]);
  let v = identityMatrix(n);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let p = 0;
    let q = 1;
    let maxValue = Math.abs(a[p]?.[q] || 0);

    for (let row = 0; row < n; row += 1) {
      for (let col = row + 1; col < n; col += 1) {
        const value = Math.abs(a[row][col]);
        if (value > maxValue) {
          maxValue = value;
          p = row;
          q = col;
        }
      }
    }

    if (maxValue < 1e-10) {
      break;
    }

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    const theta = (aqq - app) / (2 * apq);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;

    for (let index = 0; index < n; index += 1) {
      if (index !== p && index !== q) {
        const aip = a[index][p];
        const aiq = a[index][q];
        a[index][p] = c * aip - s * aiq;
        a[p][index] = a[index][p];
        a[index][q] = c * aiq + s * aip;
        a[q][index] = a[index][q];
      }
    }

    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = 0;
    a[q][p] = 0;

    for (let index = 0; index < n; index += 1) {
      const vip = v[index][p];
      const viq = v[index][q];
      v[index][p] = c * vip - s * viq;
      v[index][q] = s * vip + c * viq;
    }
  }

  const eigenvalues = a.map((row, index) => row[index]);
  const eigenvectors = transposeMatrix(v);
  return { eigenvalues, eigenvectors };
}

function isSymmetric(matrix) {
  if (matrix.length !== matrix[0].length) {
    return false;
  }
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = row + 1; col < matrix.length; col += 1) {
      if (Math.abs(matrix[row][col] - matrix[col][row]) > 1e-9) {
        return false;
      }
    }
  }
  return true;
}

function eigen2x2(matrix) {
  if (matrix.length !== 2 || matrix[0].length !== 2) {
    throw new Error("Analytic eigen decomposition is only implemented for 2x2 matrices");
  }
  const [[a, b], [c, d]] = matrix;
  const trace = a + d;
  const det = a * d - b * c;
  const discriminant = trace * trace - 4 * det;
  if (discriminant < 0) {
    throw new Error("Complex eigenvalues are not supported by this adapter");
  }
  const root = Math.sqrt(discriminant);
  const eigenvalues = [(trace + root) / 2, (trace - root) / 2];
  const eigenvectors = eigenvalues.map((lambda) => {
    if (Math.abs(b) > 1e-12) {
      const vector = [b, lambda - a];
      const scale = norm(vector);
      return scale > 1e-12 ? vector.map((value) => value / scale) : [1, 0];
    }
    if (Math.abs(c) > 1e-12) {
      const vector = [lambda - d, c];
      const scale = norm(vector);
      return scale > 1e-12 ? vector.map((value) => value / scale) : [0, 1];
    }
    return lambda === a ? [1, 0] : [0, 1];
  });
  return { eigenvalues, eigenvectors };
}

function svdDecompose(matrix) {
  const at = transposeMatrix(matrix);
  const ata = multiplyMatricesArray(at, matrix);
  const { eigenvalues, eigenvectors } = jacobiEigenSymmetric(ata);
  const ordering = eigenvalues
    .map((value, index) => ({ value: Math.max(value, 0), index }))
    .sort((left, right) => right.value - left.value);

  const singularValues = ordering.map((item) => Math.sqrt(item.value));
  const v = ordering.map((item) => eigenvectors[item.index]);
  const vMatrix = transposeMatrix(v);
  const uColumns = v.map((vector, index) => {
    const sigma = singularValues[index];
    if (sigma < 1e-12) {
      return Array(matrix.length).fill(0);
    }
    const av = matrix.map((row) => dot(row, vector));
    return av.map((value) => value / sigma);
  });
  const uMatrix = transposeMatrix(uColumns);
  return {
    u: uMatrix,
    s: singularValues,
    v_t: transposeMatrix(vMatrix),
  };
}

function tokenizeExpression(expr) {
  const tokens = [];
  let index = 0;
  const text = String(expr);

  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[0-9.]/.test(text[end])) {
        end += 1;
      }
      tokens.push({ type: "number", value: text.slice(index, end) });
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) {
        end += 1;
      }
      const value = text.slice(index, end);
      if (FUNCTION_NAMES.has(value)) {
        tokens.push({ type: "func", value });
      } else if (Object.hasOwn(CONSTANT_NAMES, value)) {
        tokens.push({ type: "const", value });
      } else if (["x", "y", "z"].includes(value)) {
        tokens.push({ type: "var", value });
      } else {
        throw new Error(`Unsupported identifier in expression: ${value}`);
      }
      index = end;
      continue;
    }
    if ("+-*/^(),[]".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }
    throw new Error(`Unsupported character in expression: ${char}`);
  }

  return tokens;
}

function shouldInsertMultiply(left, right) {
  const leftOkay = ["number", "var", "const", ")", "]"].includes(left.type);
  const rightOkay = ["number", "var", "const", "func", "("].includes(right.type);
  return leftOkay && rightOkay;
}

function compileExpression(expr) {
  const tokens = tokenizeExpression(String(expr).replace(/\^/g, "**"));
  const expanded = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (expanded.length > 0 && shouldInsertMultiply(expanded[expanded.length - 1], token)) {
      expanded.push({ type: "*", value: "*" });
    }
    expanded.push(token);
  }

  const jsExpr = expanded
    .map((token) => {
      if (token.type === "func") {
        return `Math.${token.value}`;
      }
      if (token.type === "const") {
        return CONSTANT_NAMES[token.value];
      }
      return token.value;
    })
    .join("");

  const evaluator = new Function("x", "y", "z", `return (${jsExpr});`);
  return (x = 0, y = 0, z = 0) => Number(evaluator(x, y, z));
}

function splitTopLevelList(value) {
  const raw = String(value).trim().replace(/^\[/, "").replace(/\]$/, "");
  const parts = [];
  let current = "";
  let depth = 0;

  for (const char of raw) {
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function compileVectorField(fieldExpr) {
  const parts = splitTopLevelList(fieldExpr);
  if (parts.length !== 3) {
    throw new Error("Vector field must contain exactly three components");
  }
  return parts.map((part) => compileExpression(part));
}

function finiteDifference(fn, point, axis, h = 1e-5) {
  const plus = [...point];
  const minus = [...point];
  plus[axis] += h;
  minus[axis] -= h;
  return (fn(...plus) - fn(...minus)) / (2 * h);
}

function gradientAt(fn, point) {
  return [0, 1, 2].map((axis) => finiteDifference(fn, point, axis));
}

function curlAt(fieldFns, point) {
  const [fx, fy, fz] = fieldFns;
  const dFzDy = finiteDifference((x, y, z) => fz(x, y, z), point, 1);
  const dFyDz = finiteDifference((x, y, z) => fy(x, y, z), point, 2);
  const dFxDz = finiteDifference((x, y, z) => fx(x, y, z), point, 2);
  const dFzDx = finiteDifference((x, y, z) => fz(x, y, z), point, 0);
  const dFyDx = finiteDifference((x, y, z) => fy(x, y, z), point, 0);
  const dFxDy = finiteDifference((x, y, z) => fx(x, y, z), point, 1);
  return [dFzDy - dFyDz, dFxDz - dFzDx, dFyDx - dFxDy];
}

function divergenceAt(fieldFns, point) {
  return fieldFns.reduce((sum, fn, axis) => sum + finiteDifference(fn, point, axis), 0);
}

function laplacianScalarAt(fn, point, h = 1e-4) {
  return [0, 1, 2].reduce((sum, axis) => {
    const plus = [...point];
    const minus = [...point];
    plus[axis] += h;
    minus[axis] -= h;
    return sum + (fn(...plus) - 2 * fn(...point) + fn(...minus)) / (h * h);
  }, 0);
}

function sampleLinspace(start, end, count) {
  if (count <= 1) {
    return [start];
  }
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + index * step);
}

function normalizeVector(vector) {
  const size = norm(vector);
  if (size < 1e-12) {
    throw new Error("Direction vector cannot be zero");
  }
  return vector.map((value) => value / size);
}

const TOOLS = [
  makeTool("create_tensor", "Create a tensor in the in-memory tensor store.", { shape: { type: "array", items: { type: "integer" } }, values: { type: "array", items: { type: "number" } }, name: { type: "string" } }, ["shape", "values", "name"]),
  makeTool("view_tensor", "View a tensor from the tensor store.", { name: { type: "string" } }, ["name"]),
  makeTool("delete_tensor", "Delete a tensor from the tensor store.", { name: { type: "string" } }, ["name"]),
  makeTool("add_matrices", "Add two stored tensors element-wise.", { name_a: { type: "string" }, name_b: { type: "string" } }, ["name_a", "name_b"]),
  makeTool("subtract_matrices", "Subtract two stored tensors element-wise.", { name_a: { type: "string" }, name_b: { type: "string" } }, ["name_a", "name_b"]),
  makeTool("multiply_matrices", "Multiply two stored matrices.", { name_a: { type: "string" }, name_b: { type: "string" } }, ["name_a", "name_b"]),
  makeTool("scale_matrix", "Scale a stored tensor by a scalar.", { name: { type: "string" }, scale_factor: { type: "number" }, in_place: { type: "boolean" } }, ["name", "scale_factor"]),
  makeTool("matrix_inverse", "Compute the inverse of a stored square matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("transpose", "Transpose a stored matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("determinant", "Compute the determinant of a stored square matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("rank", "Compute the rank of a stored matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("compute_eigen", "Compute eigenvalues and eigenvectors of a stored matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("qr_decompose", "Compute a QR decomposition of a stored matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("svd_decompose", "Compute an SVD decomposition of a stored matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("find_orthonormal_basis", "Find an orthonormal basis for the columns of a stored matrix.", { name: { type: "string" } }, ["name"]),
  makeTool("change_basis", "Change the basis of a stored square matrix.", { name: { type: "string" }, new_basis: { type: "array", items: { type: "array", items: { type: "number" } } } }, ["name", "new_basis"]),
  makeTool("vector_project", "Project a stored vector onto another vector.", { name: { type: "string" }, new_vector: { type: "array", items: { type: "number" } } }, ["name", "new_vector"]),
  makeTool("vector_dot_product", "Compute the dot product of two stored vectors.", { name_a: { type: "string" }, name_b: { type: "string" } }, ["name_a", "name_b"]),
  makeTool("vector_cross_product", "Compute the cross product of two stored 3D vectors.", { name_a: { type: "string" }, name_b: { type: "string" } }, ["name_a", "name_b"]),
  makeTool("gradient", "Numerically evaluate the gradient of a scalar function.", { f_str: { type: "string" }, point: { type: "array", items: { type: "number" } } }, ["f_str"]),
  makeTool("curl", "Numerically evaluate the curl of a vector field.", { f_str: { type: "string" }, point: { type: "array", items: { type: "number" } } }, ["f_str"]),
  makeTool("divergence", "Numerically evaluate the divergence of a vector field.", { f_str: { type: "string" }, point: { type: "array", items: { type: "number" } } }, ["f_str"]),
  makeTool("laplacian", "Numerically evaluate the Laplacian of a scalar or vector field.", { f_str: { type: "string" }, is_vector: { type: "boolean" }, point: { type: "array", items: { type: "number" } } }, ["f_str"]),
  makeTool("directional_deriv", "Numerically evaluate the directional derivative of a scalar function.", { f_str: { type: "string" }, u: { type: "array", items: { type: "number" } }, unit: { type: "boolean" }, point: { type: "array", items: { type: "number" } } }, ["f_str", "u"]),
  makeTool("plot_vector_field", "Sample a 3D vector field over a grid for plotting.", { f_str: { type: "string" }, bounds: { type: "array", items: { type: "number" } }, n: { type: "integer" } }, ["f_str"]),
  makeTool("plot_function", "Sample a 1D or 2D function over a grid for plotting.", { expr_str: { type: "string" }, xlim: { type: "array", items: { type: "number" } }, ylim: { type: "array", items: { type: "number" } }, grid: { type: "integer" } }, ["expr_str"]),
];

async function handleToolCall(name, args) {
  if (name === "create_tensor") {
    const tensor = createTensor(args.shape, args.values);
    tensorStore.set(args.name, tensor);
    return makeTextResult({ name: args.name, shape: tensorShape(tensor), tensor });
  }
  if (name === "view_tensor") {
    const tensor = getStoredTensor(args.name);
    return makeTextResult({ name: args.name, shape: tensorShape(tensor), tensor });
  }
  if (name === "delete_tensor") {
    if (!tensorStore.has(args.name)) {
      throw new Error(`Tensor "${args.name}" not found`);
    }
    tensorStore.delete(args.name);
    return makeTextResult({ deleted: args.name });
  }
  if (name === "add_matrices" || name === "subtract_matrices") {
    const left = getStoredTensor(args.name_a);
    const right = getStoredTensor(args.name_b);
    ensureSameShape(left, right);
    const tensor = combineTensors(left, right, name === "add_matrices" ? (a, b) => a + b : (a, b) => a - b);
    return makeTextResult({ operation: name, shape: tensorShape(tensor), tensor });
  }
  if (name === "multiply_matrices") {
    const left = toMatrix(getStoredTensor(args.name_a), args.name_a);
    const right = toMatrix(getStoredTensor(args.name_b), args.name_b);
    const tensor = multiplyMatricesArray(left, right);
    return makeTextResult({ operation: name, shape: tensorShape(tensor), tensor });
  }
  if (name === "scale_matrix") {
    const current = getStoredTensor(args.name);
    const scaled = mapTensor(current, (value) => value * Number(args.scale_factor));
    if (args.in_place !== false) {
      tensorStore.set(args.name, scaled);
    }
    return makeTextResult({ operation: name, in_place: args.in_place !== false, shape: tensorShape(scaled), tensor: scaled });
  }
  if (name === "matrix_inverse") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    return makeTextResult({ inverse: inverseMatrix(matrix) });
  }
  if (name === "transpose") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    return makeTextResult({ transpose: transposeMatrix(matrix) });
  }
  if (name === "determinant") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    return makeTextResult({ determinant: determinant(matrix) });
  }
  if (name === "rank") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    return makeTextResult({ rank: rankMatrix(matrix) });
  }
  if (name === "compute_eigen") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    const eigen = isSymmetric(matrix) ? jacobiEigenSymmetric(matrix) : eigen2x2(matrix);
    return makeTextResult(eigen);
  }
  if (name === "qr_decompose") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    return makeTextResult(gramSchmidt(matrix));
  }
  if (name === "svd_decompose") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    return makeTextResult(svdDecompose(matrix));
  }
  if (name === "find_orthonormal_basis") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    const { q } = gramSchmidt(matrix);
    return makeTextResult({ basis: transposeMatrix(q).filter((vector) => norm(vector) > 1e-10) });
  }
  if (name === "change_basis") {
    const matrix = toMatrix(getStoredTensor(args.name), args.name);
    const basis = args.new_basis.map((row) => row.map(Number));
    const basisInverse = inverseMatrix(basis);
    return makeTextResult({ transformed: multiplyMatricesArray(multiplyMatricesArray(basisInverse, matrix), basis) });
  }
  if (name === "vector_project") {
    const vector = toVector(getStoredTensor(args.name), args.name);
    const onto = args.new_vector.map(Number);
    const denom = dot(onto, onto);
    if (denom < 1e-12) {
      throw new Error("Projection vector cannot be zero");
    }
    const scale = dot(vector, onto) / denom;
    return makeTextResult({ projection: onto.map((value) => value * scale) });
  }
  if (name === "vector_dot_product") {
    const a = toVector(getStoredTensor(args.name_a), args.name_a);
    const b = toVector(getStoredTensor(args.name_b), args.name_b);
    return makeTextResult({ dot_product: dot(a, b) });
  }
  if (name === "vector_cross_product") {
    const a = toVector(getStoredTensor(args.name_a), args.name_a);
    const b = toVector(getStoredTensor(args.name_b), args.name_b);
    return makeTextResult({ cross_product: cross(a, b) });
  }
  if (name === "gradient") {
    const fn = compileExpression(args.f_str);
    const point = (args.point || [0, 0, 0]).map(Number);
    return makeTextResult({ method: "numeric", evaluation_point: point, gradient: gradientAt(fn, point) });
  }
  if (name === "curl") {
    const field = compileVectorField(args.f_str);
    const point = (args.point || [0, 0, 0]).map(Number);
    return makeTextResult({ method: "numeric", evaluation_point: point, curl: curlAt(field, point) });
  }
  if (name === "divergence") {
    const field = compileVectorField(args.f_str);
    const point = (args.point || [0, 0, 0]).map(Number);
    return makeTextResult({ method: "numeric", evaluation_point: point, divergence: divergenceAt(field, point) });
  }
  if (name === "laplacian") {
    const point = (args.point || [0, 0, 0]).map(Number);
    if (args.is_vector) {
      const field = compileVectorField(args.f_str);
      const values = field.map((fn) => laplacianScalarAt(fn, point));
      return makeTextResult({ method: "numeric", evaluation_point: point, laplacian: values, is_vector: true });
    }
    const fn = compileExpression(args.f_str);
    return makeTextResult({ method: "numeric", evaluation_point: point, laplacian: laplacianScalarAt(fn, point), is_vector: false });
  }
  if (name === "directional_deriv") {
    const fn = compileExpression(args.f_str);
    const point = (args.point || [0, 0, 0]).map(Number);
    const direction = args.unit === false ? args.u.map(Number) : normalizeVector(args.u.map(Number));
    const gradient = gradientAt(fn, point);
    return makeTextResult({ method: "numeric", evaluation_point: point, direction, directional_derivative: dot(gradient, direction) });
  }
  if (name === "plot_vector_field") {
    const field = compileVectorField(args.f_str);
    const bounds = (args.bounds || [-1, 1, -1, 1, -1, 1]).map(Number);
    const resolution = Math.min(Math.max(Number(args.n ?? 6), 2), 8);
    const xs = sampleLinspace(bounds[0], bounds[1], resolution);
    const ys = sampleLinspace(bounds[2], bounds[3], resolution);
    const zs = sampleLinspace(bounds[4], bounds[5], resolution);
    const samples = [];
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          samples.push({ point: [x, y, z], value: field.map((fn) => fn(x, y, z)) });
        }
      }
    }
    return makeTextResult({ plot_type: "vector_field_sample", bounds, n: resolution, sample_count: samples.length, samples });
  }
  if (name === "plot_function") {
    const expr = compileExpression(args.expr_str);
    const xlim = (args.xlim || [-5, 5]).map(Number);
    const ylim = (args.ylim || [-5, 5]).map(Number);
    const grid = Math.min(Math.max(Number(args.grid ?? 25), 5), 40);
    const usesY = /\by\b/.test(String(args.expr_str));
    if (!usesY) {
      const xs = sampleLinspace(xlim[0], xlim[1], grid);
      const samples = xs.map((x) => ({ x, y: expr(x, 0, 0) }));
      return makeTextResult({ plot_type: "function_2d_sample", expr: args.expr_str, xlim, sample_count: samples.length, samples });
    }
    const xs = sampleLinspace(xlim[0], xlim[1], grid);
    const ys = sampleLinspace(ylim[0], ylim[1], grid);
    const samples = [];
    for (const x of xs) {
      for (const y of ys) {
        samples.push({ x, y, z: expr(x, y, 0) });
      }
    }
    return makeTextResult({ plot_type: "function_3d_sample", expr: args.expr_str, xlim, ylim, sample_count: samples.length, samples });
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleRequest(message) {
  const id = message.id ?? null;
  if (message.method === "initialize") {
    return jsonRpcResult(id, initializationResult());
  }
  if (message.method === "notifications/initialized") {
    return null;
  }
  if (message.method === "tools/list") {
    return jsonRpcResult(id, { tools: TOOLS });
  }
  if (message.method !== "tools/call") {
    return jsonRpcError(id, -32601, `Method not found: ${message.method}`);
  }
  return jsonRpcResult(id, await handleToolCall(message.params?.name, message.params?.arguments ?? {}));
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeMessage(jsonRpcError(null, -32700, "Parse error"));
      continue;
    }
    try {
      const response = await handleRequest(message);
      if (response) {
        writeMessage(response);
      }
    } catch (error) {
      writeMessage(jsonRpcError(message.id ?? null, -32603, error instanceof Error ? error.message : String(error)));
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
