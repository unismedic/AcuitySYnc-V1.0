import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ClassificationResult {
  level: "ICU" | "HDU";
  justification: string;
}

export interface RiskScoreResult {
  score: number; // 0-100
  level: 'Low' | 'Moderate' | 'High' | 'Critical';
  factors: string[];
}

export function runClassificationLogic(vitals: any, interventions: any, positioning?: any): "ICU" | "HDU" {
  const organSupports = [
    interventions.crrt ? 1 : 0, // Renal
    (interventions.singleVasopressor || interventions.multipleVasopressors) ? 1 : 0, // Vasoactive
    (interventions.mechanicalVentilation || interventions.cpapBipap || interventions.highFlowO2) ? 1 : 0 // Respiratory
  ].reduce((a, b) => a + b, 0);

  // Condition A (Level 3 - ICU)
  if (
    interventions.mechanicalVentilation || 
    organSupports >= 2 || 
    interventions.multipleVasopressors ||
    positioning?.isProne // Prone positioning usually implies severe ARDS/ICU level care
  ) {
    return "ICU";
  }

  // Default to HDU (Level 2)
  return "HDU";
}

export async function getAIJustification(vitals: any, interventions: any, level: string, positioning?: any, clinicalContext?: any): Promise<string> {
  const prompt = `
    Given Patient parameters:
    Vitals: ${JSON.stringify(vitals)}
    Interventions: ${JSON.stringify(interventions)}
    Positioning: ${JSON.stringify(positioning)}
    Clinical Context (Labs/Meds): ${JSON.stringify(clinicalContext)}
    Outcome: ${level}
    
    Write a 2-sentence clinical justification for this classification. 
    Reference specific input parameters (including mobility/positioning and clinical context if relevant) that triggered the logic.
    CRITICAL: Include at least one specific data point or "direct quote" from the parameters provided (e.g., a specific heart rate value, a specific intervention name, or a lab result) to add transparency and clinical context.
    Example: "Patient classified as Level 3 ICU due to requirement of invasive mechanical ventilation and concurrent CRRT for acute kidney injury. The decision is heavily influenced by the 'multipleVasopressors' requirement and a heart rate of ${vitals.heartRate || 'N/A'} bpm."
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a senior intensive care consultant providing brief, accurate clinical justifications for patient acuity levels.",
      },
    });

    return response.text || "Justification could not be generated.";
  } catch (error) {
    console.error("Gemini Justification Error:", error);
    return "AI justification service unavailable.";
  }
}

export async function predictRiskScore(vitals: any, interventions: any, history: any[], patientHistory?: string): Promise<RiskScoreResult> {
  const prompt = `
    Analyze the following patient data to predict the risk of clinical escalation (deterioration) in the next 24 hours.
    
    Patient Medical History: ${patientHistory || 'Not provided'}
    Current Vitals: ${JSON.stringify(vitals)}
    Current Interventions: ${JSON.stringify(interventions)}
    Recent Assessment History (last 3): ${JSON.stringify(history.slice(0, 3))}
    
    Return a JSON object with:
    1. "score": a number from 0 to 100 representing the risk percentage.
    2. "level": one of "Low", "Moderate", "High", "Critical".
    3. "factors": an array of the top 3 clinical factors contributing to this risk, considering both current state and underlying history.
    
    Example: { "score": 75, "level": "High", "factors": ["Decreasing SpO2 trend", "Rising heart rate", "New requirement for vasopressors"] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a predictive analytics engine for critical care. Provide accurate, data-driven risk assessments in JSON format.",
        responseMimeType: "application/json"
      },
    });

    return JSON.parse(response.text || "{}") as RiskScoreResult;
  } catch (error) {
    console.error("Gemini Risk Prediction Error:", error);
    return { score: 0, level: 'Low', factors: [] };
  }
}

export async function generateSBAR(patient: any, latestAssessment: any, staff: any): Promise<string> {
  const prompt = `
    Generate a professional SBAR (Situation, Background, Assessment, Recommendation) handover report for the following patient:
    
    Patient: ${JSON.stringify(patient)}
    Latest Assessment: ${JSON.stringify(latestAssessment)}
    Staff: ${JSON.stringify(staff)}
    
    The report should be concise, clinical, and ready for a shift handover.
    Use Markdown formatting for the sections.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert clinical communicator. Generate high-quality SBAR reports for ICU/HDU handovers.",
      },
    });

    return response.text || "SBAR report could not be generated.";
  } catch (error) {
    console.error("Gemini SBAR Error:", error);
    return "AI SBAR service unavailable.";
  }
}
