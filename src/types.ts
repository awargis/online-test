/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  STUDENT = "student",
  ADMIN = "admin"
}

export interface UserProfile {
  uid: string;
  name: string;
  email?: string;
  mobile: string;
  role: UserRole;
  batch?: string;
  rollNumber?: string;
  createdAt: string; // ISO string
}

export type TestStatus = "draft" | "scheduled" | "live" | "completed";

export interface MockTest {
  id: string; // Document ID
  name: string; // e.g., JEE Main Mock Test 01
  subject: string; // e.g., Physics + Chemistry + Mathematics
  duration: number; // in minutes (e.g., 180)
  maxMarks: number; // e.g., 300
  status: TestStatus;
  startTime: string; // ISO string
  endTime: string; // ISO string
  pdfUrl: string; // PDF link or uploaded path
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  createdBy: string; // User ID of creator
}

export type DifficultyLevel = "Easy" | "Medium" | "Hard";

export interface QuestionKey {
  questionNumber: number; // e.g., 1, 2, ... 90
  correctOption: "A" | "B" | "C" | "D";
  subject: "Physics" | "Chemistry" | "Mathematics";
  chapter: string;
  topic: string;
  difficulty: DifficultyLevel;
}

export interface SubjectScore {
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  unattempted: number;
}

export interface AIAnalysisReport {
  strongAreas: string[];
  weakAreas: string[];
  mistakePattern: string; // Concept Gap, Calculation, Time Management, or mixed
  improvementPlan: {
    sevenDayPlan: string;
    revisionTopics: string[];
    practiceStrategy: string;
  };
}

export interface TestAttempt {
  id: string; // uid_testId to secure uniqueness
  testId: string;
  testName: string;
  userId: string;
  studentName: string;
  studentMobile: string;
  studentBatch: string;
  studentRollNumber: string;
  
  answers: Record<string, string>; // Maps "1" -> "A", "2" -> "" (or unselected)
  markedForReview: Record<string, boolean>; // Maps "1" -> true/false
  
  submitted: boolean;
  startTime: string; // ISO String when attempt started
  endTime?: string; // ISO String when attempt submitted
  timeLeftSeconds?: number; // saved local tracking

  // Score attributes (graded after submission)
  score?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unattempted?: number;
  accuracy?: number; // percentage
  
  subjectScores?: Record<string, SubjectScore>; // "Physics", "Chemistry", "Mathematics"
  aiAnalysis?: AIAnalysisReport;
  
  createdAt: string;
  updatedAt: string;
}
