import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}
