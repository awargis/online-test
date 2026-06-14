/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { auth, db, OperationType, handleFirestoreError } from "../firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { UserRole, UserProfile } from "../types";
import { GraduationCap, ShieldAlert, BookOpen, Smartphone, User, Users } from "lucide-react";

interface StudentRegistrationProps {
  onRegisterSuccess: (userProfile: UserProfile) => void;
  testId?: string; // If trying to take a specific test immediately
}

export default function StudentRegistration({ onRegisterSuccess, testId }: StudentRegistrationProps) {
  const [isTeacherFlow, setIsTeacherFlow] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    batch: "JEE Main Achievers 2026",
    rollNumber: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Handle Google Login for Admin/Teacher (and can also register student easily)
  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) {
        throw new Error("No user profile returned from Google Sign-In.");
      }

      // Check if user already has a profile in Firestore
      const userDocRef = doc(db, "users", user.uid);
      let userDoc;
      try {
        userDoc = await getDoc(userDocRef);
      } catch (getErr) {
        handleFirestoreError(getErr, OperationType.GET, `users/${user.uid}`);
      }

      let userProfile: UserProfile;

      if (userDoc.exists()) {
        userProfile = userDoc.data() as UserProfile;
      } else {
        // Create profile. Check if email is admin.
        const isAdminEmail = user.email === "shyamaditya4@gmail.com" || user.email?.endsWith("@admin.jeeprep.com");
        userProfile = {
          uid: user.uid,
          name: user.displayName || "Educator",
          email: user.email || undefined,
          mobile: "",
          role: isAdminEmail ? UserRole.ADMIN : UserRole.STUDENT,
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(userDocRef, userProfile);
        } catch (createErr) {
          handleFirestoreError(createErr, OperationType.CREATE, `users/${user.uid}`);
        }
      }

      onRegisterSuccess(userProfile);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Google Sign-In failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Student registration with mobile number (zero trust, offline prevention check)
  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { name, mobile, rollNumber, batch, email } = formData;
    if (!name || !mobile || !rollNumber) {
      setError("Please fill out Name, Mobile Number, and Roll Number.");
      return;
    }

    if (!/^\d{10}$/.test(mobile)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);
    try {
      // 1. Check if the mobile number has already attempted this specific test
      if (testId) {
        const attemptsQuery = query(
          collection(db, "attempts"),
          where("testId", "==", testId),
          where("studentMobile", "==", mobile)
        );
        let snapshot;
        try {
          snapshot = await getDocs(attemptsQuery);
        } catch (queryErr) {
          handleFirestoreError(queryErr, OperationType.LIST, `attempts (query testId: ${testId}, studentMobile: ${mobile})`);
        }
        if (!snapshot.empty) {
          setError("This mobile number has already attempted this mock test.");
          setLoading(false);
          return;
        }
      }

      // 2. Use or generate a static user ID for this session based on mobile
      const studentUid = `student_${mobile}`;
      const userDocRef = doc(db, "users", studentUid);
      let userDoc;
      try {
        userDoc = await getDoc(userDocRef);
      } catch (getErr) {
        handleFirestoreError(getErr, OperationType.GET, `users/${studentUid}`);
      }

      let profile: UserProfile;

      if (userDoc.exists()) {
        profile = userDoc.data() as UserProfile;
      } else {
        profile = {
          uid: studentUid,
          name,
          mobile,
          email: email || undefined,
          rollNumber,
          batch,
          role: UserRole.STUDENT,
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(userDocRef, profile);
        } catch (createErr) {
          handleFirestoreError(createErr, OperationType.CREATE, `users/${studentUid}`);
        }
      }

      onRegisterSuccess(profile);
    } catch (err: any) {
      console.error("Student registration error:", err);
      let errMsg = err.message || "Please check your network and try again.";
      try {
        if (errMsg.startsWith('{') && errMsg.endsWith('}')) {
          const parsed = JSON.parse(errMsg);
          if (parsed && parsed.error) {
            errMsg = `${parsed.error} (failed during ${parsed.operationType} on ${parsed.path || "unknown"})`;
          }
        }
      } catch (pErr) {
        // fallback to original error message
      }
      setError(`Failed to complete student enrollment: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth_page" className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-100 rounded-3xl shadow-xl overflow-hidden">
        {/* Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center">
          <div className="relative inline-block p-4 bg-white/10 rounded-2xl mb-3">
            <GraduationCap className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">JEE Mock Test Engine</h2>
          <p className="text-white/80 text-sm mt-1">JEE Main / Advanced Real-Time Practice Portal</p>
        </div>

        <div className="p-6">
          {/* Flow Switcher */}
          <div className="flex border-b border-slate-100 pb-4 mb-5">
            <button
              onClick={() => { setIsTeacherFlow(false); setError(null); }}
              className={`flex-1 py-2 text-center text-sm font-semibold rounded-lg transition-all ${
                !isTeacherFlow 
                  ? "bg-blue-50 text-blue-700" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Student Portal
            </button>
            <button
              onClick={() => { setIsTeacherFlow(true); setError(null); }}
              className={`flex-1 py-2 text-center text-sm font-semibold rounded-lg transition-all ${
                isTeacherFlow 
                  ? "bg-indigo-50 text-indigo-700" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Educator Base
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2 animate-pulse">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {!isTeacherFlow ? (
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Mobile Number (Acts as login key)
                </label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit phone number"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, "") })}
                    className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Roll Number
                </label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="JEE enrollment roll number"
                    value={formData.rollNumber}
                    onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Batch Name
                </label>
                <div className="relative">
                  <Users className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <select
                    value={formData.batch}
                    onChange={(e) => setFormData({ ...formData, batch: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="JEE Main Achievers 2026">JEE Main Achievers 2026</option>
                    <option value="JEE Advanced Intensive">JEE Advanced Intensive</option>
                    <option value="Droppers Batch A">Droppers Batch A</option>
                    <option value="12th Elite Batch">12th Elite Batch</option>
                    <option value="11th Foundation Core">11th Foundation Core</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <button
                type="submit"
                id="btn_student_enter"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "Verifying Enrollment..." : "Launch Mock Exam"}
              </button>
            </form>
          ) : (
            <div className="py-6 text-center space-y-4">
              <p className="text-xs text-slate-500">
                To access teacher dashboards, configure mock tests, upload question papers, or map answer keys, please authenticate using Google.
              </p>
              
              <button
                onClick={handleGoogleLogin}
                id="btn_admin_login"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.247 4.114a5.992 5.992 0 01-6-6 5.992 5.992 0 016-6c1.614 0 3.15.547 4.385 1.547l3.1-3.1C18.8 3.11 15.68 2 12.24 2a9.992 9.992 0 00-10 10 9.991 9.991 0 0010 10c5.3 0 9.76-3.8 9.76-9.76a8.88 8.88 0 00-.23-1.955H12.24z"/>
                </svg>
                {loading ? "Authenticating Admin..." : "Login with Google"}
              </button>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[11px] text-indigo-700 text-left">
                <p className="font-semibold mb-1">Bootstrapped Administrator</p>
                Logging in with <span className="font-mono">shyamaditya4@gmail.com</span> automatically unlocks complete educator privileges!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
