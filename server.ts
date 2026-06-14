/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up generous body limits for PDF uploads (Base64)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Serve uploaded PDFs statically
app.use("/uploads", express.static(UPLOAD_DIR));

// Lazy-initialized Gemini Client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required to perform AI analysis. Please configure it in the Secrets panel.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return geminiClient;
}

// Endpoints

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", time: new Date().toISOString() });
});

// 2. Base64 PDF Upload Handler
app.post("/api/upload-pdf", (req, res) => {
  try {
    const { base64Data, fileName } = req.body;
    if (!base64Data || !fileName) {
      return res.status(400).json({ error: "Missing base64Data or fileName payload." });
    }

    // Clean up filename to prevent directory traversal
    const safeFileName = `${Date.now()}_${path.basename(fileName).replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const destinationPath = path.join(UPLOAD_DIR, safeFileName);

    // Convert Base64 back to binary buffer
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(destinationPath, buffer);

    const fileUrl = `/uploads/${safeFileName}`;
    res.json({ success: true, fileUrl, fileName: safeFileName });
  } catch (error) {
    console.error("PDF upload failed:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "PDF save execution failed." });
  }
});

// 3. AI Performance Evaluation using Gemini
app.post("/api/analyze", async (req, res) => {
  try {
    const { studentName, testName, score, correctAnswers, wrongAnswers, unattempted, wrongQuestionsList, history } = req.body;

    const formattedWrongQuestions = (wrongQuestionsList || []).map((q: any) => 
      `Q${q.questionNumber}: ${q.subject} -> ${q.chapter} (Topic: ${q.topic}, Difficulty: ${q.difficulty || 'Medium'}, Student option: ${q.studentAnswer}, Right option: ${q.correctOption})`
    ).join("\n");

    const historySummary = (history || []).map((h: any) => 
      `Test: ${h.testName}, Score: ${h.score}/${h.maxMarks || 300}, Date: ${h.date}`
    ).join("\n");

    const systemInstruction = 
      "You are an elite, highly experienced JEE (Joint Entrance Examination) academic coach, master tutor, and predictive test analyst. " +
      "Analyze the student's JEE mock test results and provide an incredibly detailed, comprehensive study strategy in JSON format. " +
      "Verify the chapter specifications and mistake patterns to assemble a solid 7-day program.";

    const prompt = `
      StudentName: ${studentName}
      TestAttempted: ${testName}
      TotalScore: ${score} / 300
      CorrectAnswersCount: ${correctAnswers}
      WrongAnswersCount: ${wrongAnswers}
      UnattemptedCount: ${unattempted}

      Wrong Questions list and topics:
      ${formattedWrongQuestions || "None, student hit a perfect score or did not record wrong answers!"}

      Student's Attempt History (last few tests):
      ${historySummary || "No previous test attempts recorded."}

      Task: Generate a customized evaluation report.
      You must respond with a JSON object containing EXACTLY these properties:
      {
        "strongAreas": string[],
        "weakAreas": string[],
        "mistakePattern": string, (Provide 1-2 key conceptual/habitual causes of mistakes, e.g., concept gap in rotation, hurried calculation triggers, or time allocation)
        "improvementPlan": {
          "sevenDayPlan": string, (HTML/Markdown list detail study tasks for Day 1 through Day 7)
          "revisionTopics": string[],
          "practiceStrategy": string (Concrete practice guidance: revision materials, time bound drills, negative marking triggers prevention)
        }
      }
    `;

    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strongAreas: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of subjects/chapters where the student excelled."
            },
            weakAreas: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of chapters/topics that caused the most mistakes."
            },
            mistakePattern: {
              type: Type.STRING,
              description: "Synthesis of why mistakes happened."
            },
            improvementPlan: {
              type: Type.OBJECT,
              properties: {
                sevenDayPlan: {
                  type: Type.STRING,
                  description: "7-day customized daily schedule."
                },
                revisionTopics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "High weightage revision topics."
                },
                practiceStrategy: {
                  type: Type.STRING,
                  description: "Specific strategy rule to improve score and accuracy."
                }
              },
              required: ["sevenDayPlan", "revisionTopics", "practiceStrategy"]
            }
          },
          required: ["strongAreas", "weakAreas", "mistakePattern", "improvementPlan"]
        }
      }
    });

    const responseText = result.text;
    if (!responseText) {
      throw new Error("No feedback response generated from Gemini.");
    }

    const aiResponseJson = JSON.parse(responseText.trim());
    res.json(aiResponseJson);
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "AI evaluation failed." });
  }
});

// Vite Middleware integration for Fullstack applet
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
