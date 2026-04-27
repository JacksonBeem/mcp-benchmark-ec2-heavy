const STEROID_EQUIV = {
  hydrocortisone: 20,
  cortisone: 25,
  prednisone: 5,
  prednisolone: 5,
  methylprednisolone: 4,
  triamcinolone: 4,
  dexamethasone: 0.75,
  betamethasone: 0.6,
};

const OPIOID_MME = {
  codeine: 0.15,
  hydrocodone: 1,
  oxycodone: 1.5,
  oxymorphone: 3,
  hydromorphone: 4,
  morphine: 1,
  tramadol: 0.1,
  tapentadol: 0.4,
  fentanyl_transdermal_mcg_hr: 2.4,
  methadone: 3,
};

function tool(name, description, properties, required = []) {
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

const TOOLS = [
  tool("egfr_epi", "Calculate eGFR using the 2021 CKD-EPI creatinine equation.", { scr: { type: "number" }, age: { type: "integer" }, male: { type: "boolean" } }, ["scr", "age", "male"]),
  tool("egfr_epi_cr_cys", "Calculate eGFR using the 2021 CKD-EPI creatinine-cystatin C equation.", { scr: { type: "number" }, scys: { type: "number" }, age: { type: "integer" }, male: { type: "boolean" } }, ["scr", "scys", "age", "male"]),
  tool("bp_children", "Estimate pediatric blood pressure percentiles.", { years: { type: "integer" }, months: { type: "integer" }, height: { type: "number" }, sex: { type: "string" }, systolic: { type: "integer" }, diastolic: { type: "integer" } }, ["years", "months", "height", "sex", "systolic", "diastolic"]),
  tool("bmi_bsa_calculator", "Calculate BMI and BSA.", { weight_kg: { type: "number" }, height_cm: { type: "number" } }, ["weight_kg", "height_cm"]),
  tool("crcl_cockcroft_gault", "Calculate creatinine clearance using Cockcroft-Gault.", { age: { type: "integer" }, weight_kg: { type: "number" }, scr: { type: "number" }, sex: { type: "string" } }, ["age", "weight_kg", "scr", "sex"]),
  tool("map_calculator", "Calculate mean arterial pressure.", { sbp: { type: "number" }, dbp: { type: "number" } }, ["sbp", "dbp"]),
  tool("chads2_vasc_score", "Calculate CHA2DS2-VASc stroke risk score.", { age: { type: "integer" }, female: { type: "boolean" }, chf: { type: "boolean" }, hypertension: { type: "boolean" }, diabetes: { type: "boolean" }, stroke_tia_thromboembolism: { type: "boolean" }, vascular_disease: { type: "boolean" } }, ["age", "female", "chf", "hypertension", "diabetes", "stroke_tia_thromboembolism", "vascular_disease"]),
  tool("corrected_calcium", "Calculate corrected calcium for albumin.", { serum_calcium: { type: "number" }, patient_albumin: { type: "number" }, normal_albumin: { type: "number" } }, ["serum_calcium", "patient_albumin"]),
  tool("qtc_calculator", "Calculate QTc using a selected formula.", { qt_interval: { type: "number" }, heart_rate: { type: "number" }, formula: { type: "string" } }, ["qt_interval", "heart_rate"]),
  tool("wells_pe_criteria", "Calculate Wells PE criteria score.", { clinical_signs_dvt: { type: "boolean" }, pe_most_likely: { type: "boolean" }, heart_rate_gt_100: { type: "boolean" }, immobilization_or_surgery: { type: "boolean" }, previous_dvt_pe: { type: "boolean" }, hemoptysis: { type: "boolean" }, malignancy: { type: "boolean" } }, ["clinical_signs_dvt", "pe_most_likely", "heart_rate_gt_100", "immobilization_or_surgery", "previous_dvt_pe", "hemoptysis", "malignancy"]),
  tool("ibw_abw_calculator", "Calculate ideal and adjusted body weight.", { weight_kg: { type: "number" }, height_cm: { type: "number" }, male: { type: "boolean" } }, ["weight_kg", "height_cm", "male"]),
  tool("pregnancy_calculator", "Calculate estimated due date and gestational age from LMP.", { lmp_date: { type: "string" }, reference_date: { type: "string" } }, ["lmp_date"]),
  tool("revised_cardiac_risk_index", "Calculate RCRI.", { high_risk_surgery: { type: "boolean" }, history_ischemic_heart_disease: { type: "boolean" }, history_congestive_heart_failure: { type: "boolean" }, history_cerebrovascular_disease: { type: "boolean" }, insulin_therapy_for_diabetes: { type: "boolean" }, preop_creatinine_gt_2: { type: "boolean" } }, ["high_risk_surgery", "history_ischemic_heart_disease", "history_congestive_heart_failure", "history_cerebrovascular_disease", "insulin_therapy_for_diabetes", "preop_creatinine_gt_2"]),
  tool("child_pugh_score", "Calculate Child-Pugh score for cirrhosis.", { bilirubin_mg_dl: { type: "number" }, albumin_g_dl: { type: "number" }, inr: { type: "number" }, ascites: { type: "string" }, encephalopathy: { type: "string" } }, ["bilirubin_mg_dl", "albumin_g_dl", "inr", "ascites", "encephalopathy"]),
  tool("steroid_conversion", "Convert corticosteroid dosages.", { from_steroid: { type: "string" }, dose_mg: { type: "number" }, to_steroid: { type: "string" } }, ["from_steroid", "dose_mg", "to_steroid"]),
  tool("calculate_mme", "Calculate morphine milligram equivalents.", { opioid: { type: "string" }, dose_per_day: { type: "number" } }, ["opioid", "dose_per_day"]),
  tool("maintenance_fluids", "Calculate pediatric maintenance fluids using the 4-2-1 rule.", { weight_kg: { type: "number" } }, ["weight_kg"]),
  tool("corrected_sodium", "Calculate corrected sodium for hyperglycemia.", { sodium_meq_l: { type: "number" }, glucose_mg_dl: { type: "number" }, method: { type: "string" } }, ["sodium_meq_l", "glucose_mg_dl"]),
  tool("meld_3", "Calculate MELD 3.0 score.", { bilirubin_mg_dl: { type: "number" }, inr: { type: "number" }, creatinine_mg_dl: { type: "number" }, sodium_meq_l: { type: "number" }, albumin_g_dl: { type: "number" }, female: { type: "boolean" }, dialysis: { type: "boolean" } }, ["bilirubin_mg_dl", "inr", "creatinine_mg_dl", "sodium_meq_l", "albumin_g_dl", "female"]),
  tool("framingham_risk_score", "Estimate 10-year CHD risk using Framingham risk score.", { age: { type: "integer" }, male: { type: "boolean" }, total_cholesterol: { type: "number" }, hdl: { type: "number" }, systolic_bp: { type: "number" }, treated_bp: { type: "boolean" }, smoker: { type: "boolean" } }, ["age", "male", "total_cholesterol", "hdl", "systolic_bp", "treated_bp", "smoker"]),
  tool("homa_ir", "Calculate HOMA-IR.", { fasting_insulin: { type: "number" }, fasting_glucose: { type: "number" } }, ["fasting_insulin", "fasting_glucose"]),
];

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
    serverInfo: { name: "medcalc", version: "1.0.0" },
  };
}

function round(value, digits = 2) {
  return Number.parseFloat(Number(value).toFixed(digits));
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

function makeTextResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function egfrEpi(scr, age, male) {
  const k = male ? 0.9 : 0.7;
  const a = male ? -0.302 : -0.241;
  return 142 * (0.9938 ** age) * (Math.min(scr / k, 1) ** a) * (Math.max(scr / k, 1) ** -1.2) * (male ? 1 : 1.012);
}

function egfrEpiCrCys(scr, scys, age, male) {
  const kCr = male ? 0.9 : 0.7;
  const kCys = 0.8;
  const alpha = male ? (scr <= kCr ? -0.144 : -0.544) : (scr <= kCr ? -0.219 : -0.544);
  const beta = scys <= kCys ? -0.323 : -0.778;
  const sexFactor = male ? 1 : 0.963;
  return 135 * (scr / kCr) ** alpha * (scys / kCys) ** beta * (0.9961 ** age) * sexFactor;
}

function bpChildren(years, months, height, sex, systolic, diastolic) {
  const h = height > 3 ? height / 100 : height;
  const age = years + (months / 12);
  const meanSys = sex === "male" ? 102.2 + 1.82 * (age - 10) + 0.25 * ((h * 100) - 140) / 10 : 102.0 + 1.94 * (age - 10) + 0.14 * ((h * 100) - 140) / 10;
  const meanDia = sex === "male" ? 61.0 + 0.68 * (age - 10) + 0.25 * ((h * 100) - 140) / 10 : 60.5 + 1.01 * (age - 10) + 0.16 * ((h * 100) - 140) / 10;
  const sysPct = normalCdf((systolic - meanSys) / 10.7) * 100;
  const diaPct = normalCdf((diastolic - meanDia) / 11.0) * 100;
  return { systolic_percentile: round(sysPct, 1), diastolic_percentile: round(diaPct, 1) };
}

function bmiBsa(weightKg, heightCm) {
  const heightM = heightCm / 100;
  return { bmi: round(weightKg / (heightM ** 2), 2), bsa_m2: round(Math.sqrt((weightKg * heightCm) / 3600), 2) };
}

function crclCockcroftGault(age, weightKg, scr, sex) {
  const base = ((140 - age) * weightKg) / (72 * scr);
  return sex.toLowerCase() === "female" ? base * 0.85 : base;
}

function mapCalculator(sbp, dbp) {
  return (sbp + 2 * dbp) / 3;
}

function chads2VascScore(args) {
  let score = 0;
  if (args.chf) score += 1;
  if (args.hypertension) score += 1;
  if (args.diabetes) score += 1;
  if (args.stroke_tia_thromboembolism) score += 2;
  if (args.vascular_disease) score += 1;
  if (args.age >= 75) score += 2;
  else if (args.age >= 65) score += 1;
  if (args.female) score += 1;
  return { score };
}

function correctedCalcium(serumCalcium, patientAlbumin, normalAlbumin = 4) {
  return serumCalcium + 0.8 * (normalAlbumin - patientAlbumin);
}

function qtcCalculator(qtInterval, heartRate, formula = "bazett") {
  const rr = 60 / heartRate;
  switch (formula.toLowerCase()) {
    case "fridericia":
    case "fredericia":
      return qtInterval / Math.cbrt(rr);
    case "framingham":
      return qtInterval + 0.154 * (1 - rr) * 1000;
    case "hodges":
      return qtInterval + 1.75 * (heartRate - 60);
    default:
      return qtInterval / Math.sqrt(rr);
  }
}

function wellsPeCriteria(args) {
  let score = 0;
  if (args.clinical_signs_dvt) score += 3;
  if (args.pe_most_likely) score += 3;
  if (args.heart_rate_gt_100) score += 1.5;
  if (args.immobilization_or_surgery) score += 1.5;
  if (args.previous_dvt_pe) score += 1.5;
  if (args.hemoptysis) score += 1;
  if (args.malignancy) score += 1;
  return { score };
}

function ibwAbwCalculator(weightKg, heightCm, male) {
  const inchesOver5Ft = Math.max(0, (heightCm / 2.54) - 60);
  const ibw = (male ? 50 : 45.5) + (2.3 * inchesOver5Ft);
  const abw = ibw + 0.4 * (weightKg - ibw);
  return { ibw_kg: round(ibw, 2), abw_kg: round(abw, 2) };
}

function pregnancyCalculator(lmpDate, referenceDate) {
  const lmp = new Date(lmpDate);
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const due = new Date(lmp);
  due.setDate(due.getDate() + 280);
  const gestDays = Math.floor((ref - lmp) / (1000 * 60 * 60 * 24));
  return { estimated_due_date: due.toISOString().slice(0, 10), gestational_age_weeks: Math.floor(gestDays / 7), gestational_age_days: gestDays % 7 };
}

function revisedCardiacRiskIndex(args) {
  const score = [
    args.high_risk_surgery,
    args.history_ischemic_heart_disease,
    args.history_congestive_heart_failure,
    args.history_cerebrovascular_disease,
    args.insulin_therapy_for_diabetes,
    args.preop_creatinine_gt_2,
  ].filter(Boolean).length;
  return { score };
}

function childPughScore(args) {
  let score = 0;
  score += args.bilirubin_mg_dl < 2 ? 1 : args.bilirubin_mg_dl <= 3 ? 2 : 3;
  score += args.albumin_g_dl > 3.5 ? 1 : args.albumin_g_dl >= 2.8 ? 2 : 3;
  score += args.inr < 1.7 ? 1 : args.inr <= 2.3 ? 2 : 3;
  const ascites = String(args.ascites).toLowerCase();
  score += ascites === "none" ? 1 : ascites === "mild" ? 2 : 3;
  const enceph = String(args.encephalopathy).toLowerCase();
  score += enceph === "none" ? 1 : (enceph === "mild" || enceph === "grade1-2") ? 2 : 3;
  return { score, class: score <= 6 ? "A" : score <= 9 ? "B" : "C" };
}

function steroidConversion(fromSteroid, doseMg, toSteroid) {
  const from = STEROID_EQUIV[String(fromSteroid).toLowerCase()];
  const to = STEROID_EQUIV[String(toSteroid).toLowerCase()];
  if (!from || !to) throw new Error(`Unknown steroid. Supported: ${Object.keys(STEROID_EQUIV).join(", ")}`);
  const hydrocortisoneEquivalent = (doseMg / from) * 20;
  return { converted_dose_mg: round((hydrocortisoneEquivalent / 20) * to, 2) };
}

function calculateMme(opioid, dosePerDay) {
  const key = String(opioid).toLowerCase();
  const factor = OPIOID_MME[key];
  if (!factor) throw new Error(`Unknown opioid. Supported: ${Object.keys(OPIOID_MME).join(", ")}`);
  return { mme_per_day: round(dosePerDay * factor, 2) };
}

function maintenanceFluids(weightKg) {
  if (weightKg <= 10) return weightKg * 4;
  if (weightKg <= 20) return 40 + (weightKg - 10) * 2;
  return 60 + (weightKg - 20);
}

function correctedSodium(sodium, glucose, method = "katz") {
  const factor = String(method).toLowerCase() === "hillier" ? 2.4 : 1.6;
  return sodium + factor * ((glucose - 100) / 100);
}

function meld3(args) {
  const bili = Math.max(args.bilirubin_mg_dl, 1);
  const inr = Math.max(args.inr, 1);
  const creat = args.dialysis ? 3 : Math.min(Math.max(args.creatinine_mg_dl, 1), 3);
  const sodium = Math.min(Math.max(args.sodium_meq_l, 125), 137);
  const albumin = Math.min(Math.max(args.albumin_g_dl, 1.5), 3.5);
  const femaleAdj = args.female ? 1.33 : 0;
  const score = 1.33 * (137 - sodium) - (0.33 * albumin) + femaleAdj + 4.56 * Math.log(bili) + 0.82 * (137 - sodium) - 0.24 * (137 - sodium) * Math.log(bili) + 9.09 * Math.log(inr) + 11.14 * Math.log(creat) + 1.85;
  return { score: round(score, 1) };
}

function framinghamRiskScore(args) {
  const ageFactor = args.male ? 3.06 : 2.33;
  const tcFactor = args.male ? 1.12 : 1.21;
  const hdlFactor = args.male ? -0.93 : -0.71;
  const sbpFactor = args.treated_bp ? (args.male ? 1.99 : 2.82) : (args.male ? 1.93 : 2.76);
  const smokerFactor = args.smoker ? (args.male ? 0.65 : 0.53) : 0;
  const score = ageFactor * Math.log(args.age) + tcFactor * Math.log(args.total_cholesterol) + hdlFactor * Math.log(args.hdl) + sbpFactor * Math.log(args.systolic_bp) + smokerFactor;
  return { risk_index: round(score, 3) };
}

function homaIr(fastingInsulin, fastingGlucose) {
  return (fastingInsulin * fastingGlucose) / 405;
}

async function handleTool(name, args) {
  switch (name) {
    case "egfr_epi": return { egfr: round(egfrEpi(args.scr, args.age, args.male), 1) };
    case "egfr_epi_cr_cys": return { egfr: round(egfrEpiCrCys(args.scr, args.scys, args.age, args.male), 1) };
    case "bp_children": return bpChildren(args.years, args.months ?? 0, args.height, String(args.sex).toLowerCase(), args.systolic, args.diastolic);
    case "bmi_bsa_calculator": return bmiBsa(args.weight_kg, args.height_cm);
    case "crcl_cockcroft_gault": return { crcl_ml_min: round(crclCockcroftGault(args.age, args.weight_kg, args.scr, args.sex), 1) };
    case "map_calculator": return { map_mm_hg: round(mapCalculator(args.sbp, args.dbp), 1) };
    case "chads2_vasc_score": return chads2VascScore(args);
    case "corrected_calcium": return { corrected_calcium_mg_dl: round(correctedCalcium(args.serum_calcium, args.patient_albumin, args.normal_albumin ?? 4), 2) };
    case "qtc_calculator": return { qtc_ms: round(qtcCalculator(args.qt_interval, args.heart_rate, args.formula ?? "bazett"), 1) };
    case "wells_pe_criteria": return wellsPeCriteria(args);
    case "ibw_abw_calculator": return ibwAbwCalculator(args.weight_kg, args.height_cm, args.male);
    case "pregnancy_calculator": return pregnancyCalculator(args.lmp_date, args.reference_date);
    case "revised_cardiac_risk_index": return revisedCardiacRiskIndex(args);
    case "child_pugh_score": return childPughScore(args);
    case "steroid_conversion": return steroidConversion(args.from_steroid, args.dose_mg, args.to_steroid);
    case "calculate_mme": return calculateMme(args.opioid, args.dose_per_day);
    case "maintenance_fluids": return { ml_per_hour: round(maintenanceFluids(args.weight_kg), 1) };
    case "corrected_sodium": return { corrected_sodium_meq_l: round(correctedSodium(args.sodium_meq_l, args.glucose_mg_dl, args.method ?? "katz"), 2) };
    case "meld_3": return meld3(args);
    case "framingham_risk_score": return framinghamRiskScore(args);
    case "homa_ir": return { homa_ir: round(homaIr(args.fasting_insulin, args.fasting_glucose), 2) };
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(message) {
  const id = message.id ?? null;
  if (message.method === "initialize") return jsonRpcResult(id, initializationResult());
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return jsonRpcResult(id, { tools: TOOLS });
  if (message.method !== "tools/call") return jsonRpcError(id, -32601, `Method not found: ${message.method}`);
  const name = message.params?.name;
  const args = message.params?.arguments ?? {};
  return jsonRpcResult(id, makeTextResult(await handleTool(name, args)));
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); }
    catch {
      writeMessage(jsonRpcError(null, -32700, "Parse error"));
      continue;
    }
    try {
      const response = await handleRequest(message);
      if (response) writeMessage(response);
    } catch (error) {
      writeMessage(jsonRpcError(message.id ?? null, -32603, error instanceof Error ? error.message : String(error)));
    }
  }
});

process.stdin.on("end", () => process.exit(0));
