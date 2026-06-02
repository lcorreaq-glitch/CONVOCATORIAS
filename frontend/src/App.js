import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Convocatorias from "@/pages/Convocatorias";
import Configuracion from "@/pages/Configuracion";
import Propuestas from "@/pages/Propuestas";
import Jurados from "@/pages/Jurados";
import Ternas from "@/pages/Ternas";
import Asignaciones from "@/pages/Asignaciones";
import Evaluaciones from "@/pages/Evaluaciones";
import EvaluacionIndividual from "@/pages/EvaluacionIndividual";
import EvaluacionColectiva from "@/pages/EvaluacionColectiva";
import Ranking from "@/pages/Ranking";
import Actas from "@/pages/Actas";
import Reportes from "@/pages/Reportes";
import Auditoria from "@/pages/Auditoria";
import Usuarios from "@/pages/Usuarios";

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/convocatorias" element={<Convocatorias />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/propuestas" element={<Propuestas />} />
              <Route path="/jurados" element={<Jurados />} />
              <Route path="/ternas" element={<Ternas />} />
              <Route path="/asignaciones" element={<Asignaciones />} />
              <Route path="/evaluaciones" element={<Evaluaciones />} />
              <Route path="/evaluaciones/individual/:id" element={<EvaluacionIndividual />} />
              <Route path="/evaluaciones/colectiva/:id" element={<EvaluacionColectiva />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/actas" element={<Actas />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/auditoria" element={<Auditoria />} />
              <Route path="/usuarios" element={<Usuarios />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
