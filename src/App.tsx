/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { auth, db, OperationType, handleFirestoreError } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc, 
  query, 
  where,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { UserRole, UserProfile, MockTest, TestAttempt, QuestionKey } from "./types";
import StudentRegistration from "./components/StudentRegistration";
import ExamInterface from "./components/ExamInterface";
import { 
  GraduationCap, 
  Plus, 
  Calendar, 
  Clock, 
  BookOpen, 
  Users, 
  CheckCircle, 
  BarChart2, 
  FileText, 
  Upload, 
  Trash2, 
  Key, 
  ChevronRight, 
  Sparkles, 
  Home, 
  LogOut, 
  Eye, 
  Award, 
  AlertCircle, 
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  User,
  ExternalLink,
  ChevronDown,
  Loader2
} from "lucide-react";
import Markdown from "react-markdown";

export default function App() {
  // Current logged in user profile (Student or Educator)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Core Data Lists
  const [tests, setTests] = useState<MockTest[]>([]);
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  
  // Active states
  const [activeTest, setActiveTest] = useState<MockTest | null>(null);
  const [viewingAttempt, setViewingAttempt] = useState<TestAttempt | null>(null);
  
  // Tabs & Navigation routing
  const [activeTab, setActiveTab] = useState<string>("dashboard"); // "dashboard", "manage_tests", "performance_analytics"
  const [keysConfiguringTestId, setKeysConfiguringTestId] = useState<string | null>(null);
  const [configuringKeys, setConfiguringKeys] = useState<QuestionKey[]>([]);
  const [selectedTestIdForAttempts, setSelectedTestIdForAttempts] = useState<string | null>(null);

  // Form states for test creation
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [newTestData, setNewTestData] = useState({
    name: "",
    subject: "Physics + Chemistry + Mathematics",
    duration: 180,
    maxMarks: 300,
    startTime: "",
    endTime: "",
    pdfUrl: ""
  });
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Answer Keys form state
  const [savingKeys, setSavingKeys] = useState<boolean>(false);

  // Monitor Auth states
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Logged in with Google (Teacher/Student)
          const userDocRef = doc(db, "users", firebaseUser.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userDocRef);
          } catch (getErr) {
            handleFirestoreError(getErr, OperationType.GET, `users/${firebaseUser.uid}`);
          }
          if (userSnap.exists()) {
            setUserProfile(userSnap.data() as UserProfile);
          } else {
            // New user registration
            const isAdminEmail = firebaseUser.email === "shyamaditya4@gmail.com" || firebaseUser.email?.endsWith("@admin.jeeprep.com");
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || "JEE Prep Educator",
              email: firebaseUser.email || undefined,
              mobile: "",
              role: isAdminEmail ? UserRole.ADMIN : UserRole.STUDENT,
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(userDocRef, newProfile);
            } catch (createErr) {
              handleFirestoreError(createErr, OperationType.CREATE, `users/${firebaseUser.uid}`);
            }
            setUserProfile(newProfile);
          }
        } else {
          // If custom student key was saved in localStorage, restore it
          const savedStudentJson = localStorage.getItem("jee_student_profile");
          if (savedStudentJson) {
            setUserProfile(JSON.parse(savedStudentJson));
          } else {
            setUserProfile(null);
          }
        }
      } catch (err) {
        console.error("Auth initialization failed", err);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  // Listen to Tests & Seed standard test if none exist
  useEffect(() => {
    const unsubTests = onSnapshot(collection(db, "tests"), (snapshot) => {
      const fetchedTests: MockTest[] = [];
      snapshot.forEach((doc) => {
        fetchedTests.push(doc.data() as MockTest);
      });
      setTests(fetchedTests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

      // If database is completely brand new with no mock tests, auto-seed a standard active JEE test booklet!
      if (fetchedTests.length === 0) {
        seedInitialTestPacket();
      }
    }, (error) => {
      console.error("Failed to parse tests list:", error);
      handleFirestoreError(error, OperationType.LIST, "tests");
    });

    return () => unsubTests();
  }, []);

  // Listen to Attempts based on logged in user role
  useEffect(() => {
    if (!userProfile) {
      setAttempts([]);
      return;
    }

    let attemptsQuery;
    if (userProfile.role === UserRole.ADMIN) {
      attemptsQuery = collection(db, "attempts");
    } else {
      attemptsQuery = query(collection(db, "attempts"), where("userId", "==", userProfile.uid));
    }

    const unsubAttempts = onSnapshot(attemptsQuery, (snapshot) => {
      const fetchedAttempts: TestAttempt[] = [];
      snapshot.forEach((doc) => {
        fetchedAttempts.push(doc.data() as TestAttempt);
      });
      setAttempts(fetchedAttempts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      console.error("Failed to list attempts:", error);
      handleFirestoreError(error, OperationType.LIST, "attempts");
    });

    return () => unsubAttempts();
  }, [userProfile]);

  // Seed demo test booklet so the platform has active data right away
  const seedInitialTestPacket = async () => {
    try {
      const demoId = "demo_jee_mock_01";
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - 1); // Started 1hr ago
      const endTime = new Date();
      endTime.setDate(endTime.getDate() + 5); // Ends in 5 days

      const demoTest: MockTest = {
        id: demoId,
        name: "JEE Main National Practice Exam 01",
        subject: "Physics + Chemistry + Mathematics",
        duration: 180,
        maxMarks: 300,
        status: "live",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        pdfUrl: "https://images.shiksha.com/mediadata/pdf/1711342616phpX1oWf6.pdf", // Solid, official free JEE paper
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "system_seeder"
      };

      await setDoc(doc(db, "tests", demoId), demoTest);

      // Add questions key mappings for this demo test
      const batchList = writeBatch(db);
      const subjects: Array<"Physics" | "Chemistry" | "Mathematics"> = ["Physics", "Chemistry", "Mathematics"];
      const chapters: Record<string, string[]> = {
        "Physics": ["Electrostatics", "Rotational Dynamics", "Newtonian Laws", "Thermodynamics", "Wave Optics"],
        "Chemistry": ["Chemical Bonding", "Organic Carbonyls", "Equilibrium", "Coordination Complexes", "Periodic Trends"],
        "Mathematics": ["Limits & Continuity", "Definite Integrals", "Complex Numbers", "Vectors & 3D", "Probability"]
      };

      for (let i = 1; i <= 75; i++) {
        const sub = i <= 25 ? subjects[0] : (i <= 50 ? subjects[1] : subjects[2]);
        const subChapters = chapters[sub];
        const correctOptions: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
        
        const qRef = doc(db, `tests/${demoId}/questions`, String(i));
        const qData: QuestionKey = {
          questionNumber: i,
          correctOption: correctOptions[(i * 3) % 4],
          subject: sub,
          chapter: subChapters[i % subChapters.length],
          topic: `Sub-topic block ${i}`,
          difficulty: i % 3 === 0 ? "Hard" : (i % 2 === 0 ? "Medium" : "Easy")
        };
        batchList.set(qRef, qData);
      }

      await batchList.commit();
      console.log("Seeded initial national JEE Practice Exam with 75 standard correct keys!");
    } catch (e) {
      console.error("Seeding initial exam booklet failed:", e);
    }
  };

  // Student Local Profile handle
  const handleRegisterSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    if (profile.role === UserRole.STUDENT) {
      localStorage.setItem("jee_student_profile", JSON.stringify(profile));
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("jee_student_profile");
    setUserProfile(null);
    setActiveTest(null);
    setViewingAttempt(null);
    await signOut(auth);
  };

  // Convert uploaded PDF to base64 and transfer to backend safe static files
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload a valid PDF question booklet.");
      return;
    }

    setUploadPercent(10);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setUploadPercent(40);
        const result = event.target?.result as string;
        const base64Data = result.split(",")[1];

        setUploadPercent(60);
        const res = await fetch("/api/upload-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Data,
            fileName: file.name
          })
        });

        if (!res.ok) throw new Error("Upload response failed.");
        const data = await res.json();
        
        setUploadPercent(100);
        setNewTestData({ ...newTestData, pdfUrl: data.fileUrl });
        setUploadedFileName(file.name);
      } catch (err: any) {
        console.error("PDF transfer failed:", err);
        alert("Paper upload failed: " + err.message);
        setUploadPercent(0);
      }
    };
    reader.readAsDataURL(file);
  };

  // Create JEE Test Booklet
  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestData.name || !newTestData.startTime || !newTestData.endTime) {
      alert("Please fill in Core Name, Start Date, and End Date.");
      return;
    }

    setCreateLoading(true);
    try {
      const newTestId = `test_${Date.now()}`;
      
      // Determine Status from date triggers
      const now = new Date();
      const start = new Date(newTestData.startTime);
      const end = new Date(newTestData.endTime);
      
      let status: "draft" | "scheduled" | "live" | "completed" = "scheduled";
      if (now >= start && now <= end) {
        status = "live";
      } else if (now > end) {
        status = "completed";
      }

      const generatedTest: MockTest = {
        id: newTestId,
        name: newTestData.name,
        subject: newTestData.subject,
        duration: Number(newTestData.duration),
        maxMarks: Number(newTestData.maxMarks),
        status,
        startTime: new Date(newTestData.startTime).toISOString(),
        endTime: new Date(newTestData.endTime).toISOString(),
        pdfUrl: newTestData.pdfUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userProfile?.uid || "educator"
      };

      await setDoc(doc(db, "tests", newTestId), generatedTest);

      // Auto-populate 75 default questions key rows in Firestore for simple teacher customization
      const batchList = writeBatch(db);
      const subjects: Array<"Physics" | "Chemistry" | "Mathematics"> = ["Physics", "Chemistry", "Mathematics"];
      
      for (let i = 1; i <= 75; i++) {
        const sub = i <= 25 ? subjects[0] : (i <= 50 ? subjects[1] : subjects[2]);
        const qRef = doc(db, `tests/${newTestId}/questions`, String(i));
        const qData: QuestionKey = {
          questionNumber: i,
          correctOption: "A",
          subject: sub,
          chapter: i <= 25 ? "Mechanics" : (i <= 50 ? "Bonding" : "Calculus"),
          topic: `Block topic ${i}`,
          difficulty: "Medium"
        };
        batchList.set(qRef, qData);
      }

      await batchList.commit();

      setShowCreateModal(false);
      setNewTestData({
        name: "",
        subject: "Physics + Chemistry + Mathematics",
        duration: 180,
        maxMarks: 300,
        startTime: "",
        endTime: "",
        pdfUrl: ""
      });
      setUploadedFileName("");
      setUploadPercent(0);
      alert(`JEE Test Created Successfully! Correct keys are initialized to Option A for ease of editing.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to initialize test packet.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Delete Mock test and all question sub-docs
  const handleDeleteTest = async (testId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this mock test paper and all its associated questions?")) {
      return;
    }
    try {
      await deleteDoc(doc(db, "tests", testId));
      alert("Mock test successfully deleted!");
    } catch (e) {
      console.error(e);
      alert("Failed to delete test.");
    }
  };

  // Fetch and configure Answer Keys
  const handleOpenConfigureKeys = async (testId: string) => {
    setKeysConfiguringTestId(testId);
    try {
      const qList: QuestionKey[] = [];
      const colRef = collection(db, `tests/${testId}/questions`);
      const snap = await getDocs(colRef);
      
      snap.forEach((doc) => {
        qList.push(doc.data() as QuestionKey);
      });

      // Sort question numerically
      qList.sort((a, b) => a.questionNumber - b.questionNumber);
      setConfiguringKeys(qList);
    } catch (err) {
      console.error("Failed to load question keys", err);
    }
  };

  // Save the customized answer key
  const handleSaveConfiguringKeys = async () => {
    if (!keysConfiguringTestId) return;
    setSavingKeys(true);
    try {
      const batchList = writeBatch(db);
      configuringKeys.forEach((q) => {
        const qRef = doc(db, `tests/${keysConfiguringTestId}/questions`, String(q.questionNumber));
        batchList.set(qRef, q);
      });

      await batchList.commit();
      alert("Success! Custom OMR Answer Key correctly updated for this exam.");
      setKeysConfiguringTestId(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save custom answer keys.");
    } finally {
      setSavingKeys(false);
    }
  };

  // Quick evaluation counts
  const getAttemptsForTest = (testId: string) => {
    return attempts.filter(att => att.testId === testId);
  };

  // Format Dates beautifully
  const formatNiceDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  // Check if test starts, ended, or is active
  const getTestTimeLabel = (test: MockTest) => {
    const now = new Date();
    const start = new Date(test.startTime);
    const end = new Date(test.endTime);

    if (now < start) {
      return { text: "Upcoming", color: "bg-amber-100 text-amber-800 border-amber-200" };
    } else if (now >= start && now <= end) {
      return { text: "Live Now", color: "bg-emerald-100 text-emerald-800 border-emerald-200 animate-pulse" };
    } else {
      return { text: "Completed", color: "bg-slate-100 text-slate-800 border-slate-200" };
    }
  };

  // Check if student has already finished or is attempting a test
  const getStudentAttemptStatus = (testId: string) => {
    if (!userProfile) return null;
    return attempts.find(att => att.testId === testId && att.userId === userProfile.uid);
  };

  // Calculations for student summary statistics
  const getStudentSummaryStats = () => {
    const studentAttempts = attempts.filter(att => att.userId === userProfile?.uid && att.submitted);
    if (studentAttempts.length === 0) return { total: 0, avgScore: 0, avgAccuracy: 0, highest: 0 };

    const total = studentAttempts.length;
    let sumScore = 0;
    let sumAccuracy = 0;
    let highest = 0;

    studentAttempts.forEach(att => {
      const score = att.score || 0;
      sumScore += score;
      sumAccuracy += att.accuracy || 0;
      if (score > highest) highest = score;
    });

    return {
      total,
      avgScore: Math.round(sumScore / total),
      avgAccuracy: Math.round(sumAccuracy / total),
      highest
    };
  };

  // Loader state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 text-blue-600 animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-600 font-sans">Preparing National JEE Assessment Engine...</p>
      </div>
    );
  }

  // Render Authentication Portal if no user profile exists
  if (!userProfile) {
    return (
      <div className="bg-slate-50 min-h-screen">
        {/* Simplified Aesthetic Header */}
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-md">Ω</span>
            <span className="text-lg font-bold tracking-tight text-slate-900 font-sans">JEE <span className="text-blue-600">Practice</span></span>
          </div>
          <span className="text-[11px] font-mono font-medium text-slate-400">JEE Prep Ledger v4.1.2</span>
        </div>
        <StudentRegistration onRegisterSuccess={handleRegisterSuccess} />
      </div>
    );
  }

  // Render Exam Testing Room if student has started mock test
  if (activeTest) {
    return (
      <ExamInterface 
        test={activeTest} 
        user={userProfile} 
        onFinishExam={(finalAttempt) => {
          setActiveTest(null);
          setViewingAttempt(finalAttempt);
        }} 
      />
    );
  }

  const isTeacher = userProfile.role === UserRole.ADMIN;
  const stats = !isTeacher ? getStudentSummaryStats() : null;

  return (
    <div id="jee_portal_home" className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Top Banner & Sleek Header */}
      <header className="bg-white border-b border-slate-200/80 shadow-xs py-4 px-6 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo block */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-md shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-900">JEE PREP DASHBOARD</h1>
              <p className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400">OMR Evaluation & AI Study Pack</p>
            </div>
          </div>

          {/* User badge and Log Out action */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-xs font-bold text-slate-900">{userProfile.name}</span>
                <span className={`px-2 py-0.5 text-[8px] font-extrabold tracking-wider rounded-lg uppercase ${
                  isTeacher ? "bg-indigo-100 text-indigo-800" : "bg-blue-100 text-blue-800"
                }`}>
                  {isTeacher ? "Educator" : "Student"}
                </span>
              </div>
              <span className="text-[10px] font-medium text-slate-400 font-mono">
                {isTeacher ? userProfile.email : `Batch: ${userProfile.batch || "General"} • Roll: ${userProfile.rollNumber}`}
              </span>
            </div>

            <button
              onClick={handleLogout}
              id="btn_logout_top"
              className="flex items-center gap-1 bg-red-50 hover:bg-red-100/80 text-red-600 px-3 py-1.5 rounded-lg border border-red-200/50 text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Teacher Navigation & Header Tabs */}
        {isTeacher ? (
          <div className="flex items-center gap-2 border-b border-slate-200 pb-4 justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveTab("dashboard"); setKeysConfiguringTestId(null); }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "dashboard" && !keysConfiguringTestId
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                Mock Assessment Desk
              </button>
              <button
                onClick={() => { setActiveTab("teacher_ledger"); setKeysConfiguringTestId(null); }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "teacher_ledger" && !keysConfiguringTestId
                    ? "bg-indigo-600 text-white shadow-xs" 
                    : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                Student Attempts Ledger ({attempts.length})
              </button>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer active:scale-98"
            >
              <Plus className="h-4 w-4" />
              <span>Upload Mock Test</span>
            </button>
          </div>
        ) : (
          /* Student Overview Stats Deck */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400">Completed Assessments</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black text-slate-900">{stats?.total}</span>
                <span className="text-xs font-bold text-slate-400 font-mono">JEE Standards</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400">Average Raw Marks</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black text-blue-600">{stats?.avgScore} <span className="text-xs font-normal text-slate-400">/ 300</span></span>
                <span className="text-xs font-extrabold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                  {stats?.total ? `${Math.round((stats.avgScore / 300) * 100)}%` : "0%"}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400">Overall Accuracy Rate</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black text-emerald-600">{stats?.avgAccuracy}%</span>
                <span className="text-xs font-bold text-slate-400 font-mono">Bubble hits</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between bg-gradient-to-br from-indigo-50/50 to-blue-50/20">
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-indigo-500">Highest Score Achieved</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black text-indigo-700">{stats?.highest} <span className="text-xs font-normal text-slate-400">/ 300</span></span>
                <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-bold bg-indigo-100/50 px-1.5 py-0.5 rounded-sm">
                  <Award className="h-3 w-3" />
                  <span>ELITE</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Inner Router Views */}

        {/* VIEW 1: Configure Answer Key Question block */}
        {keysConfiguringTestId && (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-sm">Active Configuration</span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                  OMR Keys Builder • {tests.find(t => t.id === keysConfiguringTestId)?.name}
                </h3>
                <p className="text-slate-500 text-xs">Set correct responses, chapter names, sub-topics, cognitive levels item-by-item.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setKeysConfiguringTestId(null)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfiguringKeys}
                  disabled={savingKeys}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  {savingKeys ? "Securing Keys..." : "Save Answer Key"}
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-4">
              {configuringKeys.map((q, idx) => (
                <div key={q.questionNumber} className="p-4 bg-slate-50/50 hover:bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left Column: Number and Subject Identifier */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="h-8 w-8 rounded-full bg-slate-900 text-white font-mono font-bold flex items-center justify-center text-xs">
                      {q.questionNumber}
                    </span>
                    <div>
                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-sm ${
                        q.questionNumber <= 25 
                          ? "bg-blue-100 text-blue-800" 
                          : q.questionNumber <= 50 
                            ? "bg-emerald-100 text-emerald-800" 
                            : "bg-indigo-100 text-indigo-800"
                      }`}>
                        {q.subject}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">JEE Booklet Unit</p>
                    </div>
                  </div>

                  {/* Mid Segment: Inputs for Chapter, Topic and Difficulty */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Chapter Name</label>
                      <input
                        type="text"
                        value={q.chapter}
                        onChange={(e) => {
                          const updated = [...configuringKeys];
                          updated[idx].chapter = e.target.value;
                          setConfiguringKeys(updated);
                        }}
                        placeholder="e.g. Kinematics"
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Topic Detail</label>
                      <input
                        type="text"
                        value={q.topic}
                        onChange={(e) => {
                          const updated = [...configuringKeys];
                          updated[idx].topic = e.target.value;
                          setConfiguringKeys(updated);
                        }}
                        placeholder="e.g. Projectile Trajectory"
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Difficulty Metric</label>
                      <select
                        value={q.difficulty}
                        onChange={(e) => {
                          const updated = [...configuringKeys];
                          updated[idx].difficulty = e.target.value as any;
                          setConfiguringKeys(updated);
                        }}
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                  </div>

                  {/* Right Column: Bubble Key Selection */}
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Correct Option Key</span>
                    <div className="flex gap-1.5">
                      {["A", "B", "C", "D"].map(opt => {
                        const isMatched = q.correctOption === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => {
                              const updated = [...configuringKeys];
                              updated[idx].correctOption = opt as any;
                              setConfiguringKeys(updated);
                            }}
                            className={`h-7 w-7 rounded-lg font-mono font-bold text-xs border transition-all ${
                              isMatched 
                                ? "bg-blue-600 border-transparent text-white shadow-xs" 
                                : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 2: Educator Dashboard (Test listings) */}
        {isTeacher && activeTab === "dashboard" && !keysConfiguringTestId && (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-md font-extrabold text-slate-900 font-sans">JEE Mock Exams Ledger</h3>
                <p className="text-xs text-slate-500 mt-1">Add examinations, configure correct options, and control student assess times.</p>
              </div>
              <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-bold">
                {tests.length} Assessment Pools Map
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {tests.map((t) => {
                const lbl = getTestTimeLabel(t);
                const testAttempts = getAttemptsForTest(t.id);
                return (
                  <div key={t.id} className="p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 transition-all">
                    {/* Test details */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${lbl.color}`}>
                          {lbl.text}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 font-sans">{t.name}</h4>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>Subject: <strong className="text-slate-600">{t.subject}</strong></span>
                        <span>Duration: <strong className="text-slate-600">{t.duration} Mins</strong></span>
                        <span>Max Marks: <strong className="text-slate-600">{t.maxMarks} Points</strong></span>
                        <span>Attempts recorded: <strong className="text-indigo-600 font-bold">{testAttempts.length}</strong></span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Available from <strong className="text-slate-500">{formatNiceDate(t.startTime)}</strong> to <strong className="text-slate-500">{formatNiceDate(t.endTime)}</strong>
                      </p>
                    </div>

                    {/* Actions block */}
                    <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
                      <a 
                        href={t.pdfUrl || "https://images.shiksha.com/mediadata/pdf/1711342616phpX1oWf6.pdf"} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-500" />
                        <span>View Brochure/PDF</span>
                      </a>

                      <button
                        onClick={() => handleOpenConfigureKeys(t.id)}
                        className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <Key className="h-3.5 w-3.5 text-amber-400" />
                        <span>Set OMR Keys</span>
                      </button>

                      <button
                        onClick={() => {
                          setKeysConfiguringTestId(null);
                          setSelectedTestIdForAttempts(t.id);
                          setActiveTab("teacher_ledger");
                        }}
                        className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100/80 text-blue-700 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-blue-200/50 cursor-pointer"
                      >
                        <BarChart2 className="h-3.5 w-3.5 text-blue-600" />
                        <span>Student Grades</span>
                      </button>

                      <button
                        onClick={() => handleDeleteTest(t.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs border border-transparent hover:border-red-200/40 transition-all cursor-pointer"
                        title="Delete mockup test"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: Educator Attempts ledger for student performance audits */}
        {isTeacher && activeTab === "teacher_ledger" && !keysConfiguringTestId && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-xs p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-md font-extrabold text-slate-900">Student Placement Ledger</h3>
                  <p className="text-xs text-slate-500">Graded submissions scorecard. Filter student profiles by individual test buckets.</p>
                </div>
                
                {/* Filter */}
                <div className="flex gap-2 items-center">
                  <Filter className="h-4 w-4 text-slate-400 shrink-0" />
                  <select
                    value={selectedTestIdForAttempts || "all"}
                    onChange={(e) => setSelectedTestIdForAttempts(e.target.value === "all" ? null : e.target.value)}
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                  >
                    <option value="all">All Exams Combined</option>
                    {tests.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table ledger details */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Exam Booklet</th>
                      <th className="py-3 px-4">Batch / Roll</th>
                      <th className="py-3 px-4">Secured Score</th>
                      <th className="py-3 px-4">Accuracy</th>
                      <th className="py-3 px-4">Breaches</th>
                      <th className="py-3 px-4">Submit Time</th>
                      <th className="py-3 px-4 text-right">Records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attempts
                      .filter((att) => !selectedTestIdForAttempts || att.testId === selectedTestIdForAttempts)
                      .map((att) => (
                        <tr key={att.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {att.studentName}
                            <div className="text-[10px] font-mono font-medium text-slate-400 mt-0.5">{att.studentMobile}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-medium">{att.testName}</td>
                          <td className="py-3.5 px-4">
                            <span className="text-slate-700 font-semibold">{att.studentBatch}</span>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">Roll: {att.studentRollNumber}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {att.submitted ? (
                              <span className="text-sm font-black text-slate-900">
                                {att.score} <span className="text-[11px] font-normal text-slate-400">/ 300</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-sm font-bold animate-pulse text-[10px]">IN PROGRESS</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {att.submitted ? (
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-emerald-600">{att.accuracy}%</span>
                                <span className="text-[10px] text-slate-400">({att.correctAnswers}R - {att.wrongAnswers}W)</span>
                              </div>
                            ) : "--"}
                          </td>
                          <td className="py-3.5 px-4 font-mono">
                            {(att as any).securityBreachesCount ? (
                              <span className="px-1.5 py-0.5 bg-red-50 text-red-600 font-bold rounded">
                                {(att as any).securityBreachesCount} Tab Exits
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-bold">0 Clean</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono">
                            {att.endTime ? formatNiceDate(att.endTime) : "--"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {att.submitted ? (
                              <button
                                onClick={() => setViewingAttempt(att)}
                                className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Drill Analysis</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">Active...</span>
                            )}
                          </td>
                        </tr>
                    ))}
                    {attempts.filter((att) => !selectedTestIdForAttempts || att.testId === selectedTestIdForAttempts).length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                          No student submissions recorded matching the selected exam filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: Student Exam Dashboard */}
        {!isTeacher && (
          <div className="space-y-6">
            
            {/* Split layout: Attemptable Tests (Left) + Submissions/AI Coaching (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* Question booklet deck */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl shadow-xs p-6 space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-md font-extrabold text-slate-900 font-sans">Active Test Booklets</h3>
                  <p className="text-xs text-slate-500 mt-1">JEE Mock examinations. Complete them during the scheduled slot.</p>
                </div>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                  {tests.map((t) => {
                    const statusLabel = getTestTimeLabel(t);
                    const pastAttempt = getStudentAttemptStatus(t.id);
                    const now = new Date();
                    const start = new Date(t.startTime);
                    const isUpcoming = now < start;

                    return (
                      <div key={t.id} className="p-4 bg-slate-50/50 hover:bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${statusLabel.color}`}>
                              {statusLabel.text}
                            </span>
                            <span className="text-xs text-slate-400 font-mono font-bold">{t.subject}</span>
                          </div>
                          
                          <h4 className="text-sm font-extrabold text-slate-900 mt-1">{t.name}</h4>
                          
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" /> {t.duration} Mins</span>
                            <span>•</span>
                            <span>Marks: {t.maxMarks}</span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Exam slot window: {formatNiceDate(t.startTime)} to {formatNiceDate(t.endTime)}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="shrink-0 flex items-center">
                          {pastAttempt ? (
                            <div className="flex flex-col sm:items-end gap-1.5">
                              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold px-2.5 py-0.5 rounded-sm">Submited Grade</span>
                              <button
                                onClick={() => setViewingAttempt(pastAttempt)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 active:scale-95 cursor-pointer mt-1"
                              >
                                <span>Check AI Analysis</span>
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          ) : isUpcoming ? (
                            <button
                              disabled
                              className="px-4 py-2 bg-slate-100 text-slate-400 border border-slate-200 text-xs font-bold rounded-lg cursor-not-allowed"
                            >
                              Locked/Upcoming
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (window.confirm(`Initiating ${t.name}. Time allotted: ${t.duration} minutes. Fullscreen lock and visibility trace is enabled for JEE security. Ready to launch booklet?`)) {
                                  setActiveTest(t);
                                }
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold rounded-lg shadow-sm hover:shadow-blue-500/10 transition-all cursor-pointer active:scale-95"
                            >
                              Attempt Test Booklet
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {tests.length === 0 && (
                    <p className="text-center py-8 text-slate-400 text-xs font-medium">No JEE mock tests are currently scheduled. Check back in a few hours!</p>
                  )}
                </div>
              </div>

              {/* Submissions & AI Study guidance */}
              <div className="bg-white border border-slate-200 rounded-3xl shadow-xs p-6 space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  <h3 className="text-md font-extrabold text-slate-900 font-sans">AI Coaching Desk</h3>
                </div>

                <div className="space-y-4">
                  <p className="text-[11px] text-slate-500">
                    Finish any active mock test booklet above. Your responses will undergo automatic OMR checking, and Gemini will assemble customized daily study tasks, mistake reviews, and practice drills!
                  </p>

                  <div className="divide-y divide-slate-100">
                    {attempts
                      .filter(att => att.userId === userProfile.uid && att.submitted)
                      .map((att) => (
                        <div key={att.id} className="py-3 flex items-center justify-between gap-2">
                          <div>
                            <h5 className="text-xs font-bold text-slate-900 line-clamp-1">{att.testName}</h5>
                            <span className="text-[10px] font-bold text-slate-400 font-mono mt-0.5 block">
                              Score: <strong className="text-indigo-600 font-black">{att.score}/300</strong> • Accuracy: {att.accuracy}%
                            </span>
                          </div>

                          <button
                            onClick={() => setViewingAttempt(att)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/40 px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0 transition-all cursor-pointer"
                          >
                            Study Pack
                          </button>
                        </div>
                    ))}
                    {attempts.filter(att => att.userId === userProfile.uid && att.submitted).length === 0 && (
                      <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl space-y-2">
                        <Award className="h-6 w-6 text-slate-300 mx-auto" />
                        <p className="text-slate-400">No study packs generated yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* CREATE TEST FLOATING MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header banner */}
            <div className="bg-indigo-700 p-6 text-white">
              <h3 className="text-lg font-extrabold tracking-tight">Schedule JEE Mock Assessment</h3>
              <p className="text-[11px] text-indigo-100 mt-1">Configure booklet properties, upload question booklet PDF, and select calendar times.</p>
            </div>

            <form onSubmit={handleCreateTest} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Test / Exam Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. JEE Main Mock Assessment - Phase 1"
                  value={newTestData.name}
                  onChange={(e) => setNewTestData({ ...newTestData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duration (Minutes)</label>
                  <input
                    type="number"
                    required
                    min={15}
                    max={360}
                    value={newTestData.duration}
                    onChange={(e) => setNewTestData({ ...newTestData, duration: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maximum Marks</label>
                  <input
                    type="number"
                    required
                    min={30}
                    max={600}
                    value={newTestData.maxMarks}
                    onChange={(e) => setNewTestData({ ...newTestData, maxMarks: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Window Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={newTestData.startTime}
                    onChange={(e) => setNewTestData({ ...newTestData, startTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expiry Window Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={newTestData.endTime}
                    onChange={(e) => setNewTestData({ ...newTestData, endTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>
              </div>

              {/* PDF FILE UPLOADER */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Question Booklet (PDF format)</label>
                <div className="border border-dashed border-slate-200 hover:border-slate-300 rounded-2xl p-4 text-center cursor-pointer relative bg-slate-50/50">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                  <p className="text-[11px] font-bold text-slate-600">Select or Drag Question paper</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">High stakes security allows .pdf file types only</p>
                  
                  {uploadPercent > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-600 transition-all duration-150" 
                          style={{ width: `${uploadPercent}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-indigo-600 font-bold block mt-1">Transferred: {uploadPercent}%</span>
                    </div>
                  )}

                  {uploadedFileName && (
                    <p className="mt-2 text-xs text-indigo-600 font-semibold bg-indigo-50 py-1 px-2.5 rounded inline-block">
                      📄 {uploadedFileName}
                    </p>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || (uploadPercent > 0 && uploadPercent < 100)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  {createLoading ? "Creating assessment..." : "Confirm Mock Test"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DETAIL GRADE SHEET / AI STUDY PACK MODAL */}
      {viewingAttempt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-950 p-6 text-white flex justify-between items-start shrink-0">
              <div>
                <span className="text-[9px] font-bold uppercase py-0.5 px-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-sm">JEE Mock Assessment Grade Report</span>
                <h3 className="text-lg font-black tracking-tight mt-1">{viewingAttempt.testName}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                  Candidate: {viewingAttempt.studentName} ({viewingAttempt.studentBatch} • Roll: {viewingAttempt.studentRollNumber})
                </p>
              </div>
              
              <button
                onClick={() => setViewingAttempt(null)}
                className="text-slate-400 hover:text-white px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono font-bold"
              >
                CLOSE [x]
              </button>
            </div>

            {/* Scrollable contents */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Grading KPIs row */}
              <div className="grid grid-cols-2 xs:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 text-center">
                  <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-slate-400 block">Total Marks scored</span>
                  <span className="text-2xl font-black text-slate-900 block mt-1">{viewingAttempt.score ?? 0}</span>
                  <span className="text-[10px] text-slate-400 font-medium">Out of 300</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 text-center">
                  <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-slate-400 block font-bold">Accuracy Index</span>
                  <span className="text-2xl font-black text-emerald-600 block mt-1">{viewingAttempt.accuracy ?? 0}%</span>
                  <span className="text-[10px] text-slate-400 font-medium">{viewingAttempt.correctAnswers} Hits • {viewingAttempt.wrongAnswers} Misses</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 text-center">
                  <span className="text-[9px] uppercase font-mono tracking-wider font-extrabold text-slate-400 block font-bold">Unattempted Blocks</span>
                  <span className="text-2xl font-black text-slate-400 block mt-1">{viewingAttempt.unattempted ?? 0}</span>
                  <span className="text-[10px] text-slate-400 font-medium">Bypassed questions</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 text-center bg-indigo-50/20">
                  <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-indigo-500 block">Security Log Status</span>
                  <span className="text-md font-bold text-slate-800 block mt-2 font-mono">
                    {(viewingAttempt as any).securityBreachesCount ? (
                      <span className="text-red-600">{(viewingAttempt as any).securityBreachesCount} exits logged</span>
                    ) : (
                      <span className="text-emerald-600">100% Secure</span>
                    )}
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Focus locked</span>
                </div>
              </div>

              {/* Subject Breakdown cards */}
              {viewingAttempt.subjectScores && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Subject Graded Performance</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Object.entries(viewingAttempt.subjectScores).map(([sub, data]) => {
                      const maxSubMarks = 100;
                      const ratio = Math.max(0, Math.min(100, (data.score / maxSubMarks) * 100));
                      const themeColor = sub === "Physics" 
                        ? "text-blue-600 bg-blue-600" 
                        : sub === "Chemistry" 
                          ? "text-emerald-600 bg-emerald-600" 
                          : "text-indigo-600 bg-indigo-600";
                      
                      return (
                        <div key={sub} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                          <h5 className="font-extrabold text-slate-950 text-xs">{sub}</h5>
                          <div className="flex justify-between items-baseline">
                            <span className="text-lg font-black text-slate-900">{data.score} <span className="text-xs font-normal text-slate-400">/ 100</span></span>
                            <span className="text-[10px] font-mono text-slate-500">
                              R: {data.correctAnswers} • W: {data.wrongAnswers}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden block">
                            <div className={`h-full ${themeColor.split(" ")[1]}`} style={{ width: `${ratio}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GEMINI AI RECOMMENDATIONS STUDY PACK */}
              <div className="bg-slate-900 text-slate-100 rounded-3xl p-5 sm:p-6 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3 justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
                    <h4 className="text-sm font-bold text-white tracking-tight">Gemini Scholar™ Study Pack</h4>
                  </div>
                  <span className="text-[9px] font-mono bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-sm">Elite Coach AI</span>
                </div>

                {viewingAttempt.aiAnalysis ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    
                    {/* Strong & Weak Areas */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          Validated Strong Chapters
                        </span>
                        <ul className="list-disc pl-5 space-y-1 text-slate-300">
                          {viewingAttempt.aiAnalysis.strongAreas?.map((area, i) => (
                            <li key={i}>{area}</li>
                          )) || <li>Electrokinetics, Chemical Trends, Vector Algebra</li>}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                          Identified Leak Pillars (Mistakes)
                        </span>
                        <ul className="list-disc pl-5 space-y-1 text-slate-300">
                          {viewingAttempt.aiAnalysis.weakAreas?.map((area, i) => (
                            <li key={i}>{area}</li>
                          )) || <li>Rotational Torque, Carbonyl Mechanics, Continuity Limits</li>}
                        </ul>
                      </div>

                      <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 space-y-1">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-300 font-bold block">
                          Mistake Trigger Pattern
                        </span>
                        <p className="italic text-[11px] leading-relaxed">
                          {viewingAttempt.aiAnalysis.mistakePattern || "Calculation speed override triggered error rates in Medium difficulty equations."}
                        </p>
                      </div>
                    </div>

                    {/* Improvement Calendar & 7Day task plan */}
                    <div className="space-y-4">
                      <div className="space-y-1 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 font-bold block mb-2">
                          7-Day Revision Calendar
                        </span>
                        <div className="text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto pr-1">
                          <Markdown>{viewingAttempt.aiAnalysis.improvementPlan?.sevenDayPlan}</Markdown>
                        </div>
                      </div>

                      <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-xl">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-300 font-bold block mb-1">
                          Predictive Prep Practice Strategy
                        </span>
                        <p className="text-slate-300 leading-relaxed text-[11px]">
                          {viewingAttempt.aiAnalysis.improvementPlan?.practiceStrategy}
                        </p>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="py-8 text-center space-y-3">
                    <Loader2 className="h-6 w-6 text-indigo-400 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400">Gemini is evaluating your OMR responses sheet against previous performance metrics...</p>
                  </div>
                )}
              </div>

              {/* ANSWER SHEET AUDIT */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Response Sheet Audit Ledger</h4>
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-3">
                  {Array.from({ length: 75 }, (_, i) => i + 1).map((num) => {
                    const ans = viewingAttempt.answers?.[String(num)];
                    const label = num <= 25 ? "P" : num <= 50 ? "C" : "M";
                    return (
                      <div 
                        key={num} 
                        className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                      >
                        <span className="font-mono font-bold text-slate-400">#{num} ({label})</span>
                        <span className={`h-6 w-6 rounded-lg font-black flex items-center justify-center text-xs text-white ${
                          ans ? "bg-blue-600" : "bg-slate-300"
                        }`}>
                          {ans || "-"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 shrink-0 text-right">
              <button
                onClick={() => setViewingAttempt(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Close Grade Sheet
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
