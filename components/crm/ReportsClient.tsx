"use client";

import { useMemo, useEffect, useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar, Users, UserMinus, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Appointment, Patient } from "@/types/database";

interface ReportsClientProps {
  appointments: Appointment[];
  patients: Patient[];
}

export default function ReportsClient({ appointments, patients }: ReportsClientProps) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [colors, setColors] = useState({
    accent: "#10B981",
    destructive: "#E05353",
    secondary: "#717D84",
    primary: "#0F172A",
    sidebar: "#1A2E45",
    completed: "#4C1D95",
    confirmed: "#065F46",
    pending: "#92400E"
  });

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    
    const updateColors = () => {
      const style = getComputedStyle(root);
      const dark = root.classList.contains("dark");
      setIsDark(dark);
      
      setColors({
        accent: style.getPropertyValue("--brand-accent").trim() || "#10B981",
        destructive: style.getPropertyValue("--destructive").trim() || "#E05353",
        secondary: style.getPropertyValue("--text-secondary").trim() || "#717D84",
        primary: style.getPropertyValue("--text-primary").trim() || "#0F172A",
        sidebar: style.getPropertyValue("--sidebar-bg").trim() || "#1A2E45",
        completed: style.getPropertyValue("--state-completed-text").trim() || "#4C1D95",
        confirmed: style.getPropertyValue("--state-confirmed-text").trim() || "#065F46",
        pending: style.getPropertyValue("--state-pending-text").trim() || "#92400E"
      });
    };

    updateColors();
    const observer = new MutationObserver(updateColors);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // 1. Citas por mes (últimos 6 meses)
  const monthlyData = useMemo(() => {
    const last6Months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date(),
    });

    return last6Months.map((month) => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const count = appointments.filter((a) => {
        const d = new Date(a.scheduled_at);
        return isWithinInterval(d, { start, end });
      }).length;

      return {
        name: format(month, "MMM", { locale: es }).toUpperCase(),
        total: count,
      };
    });
  }, [appointments]);

  // 2. Tasa de No-shows (distribución por estado)
  const statusData = useMemo(() => {
    const completed = appointments.filter((a) => a.status === "completed").length;
    const noShow = appointments.filter((a) => a.status === "no_show").length;
    const confirmed = appointments.filter((a) => a.status === "confirmed").length;
    const cancelled = appointments.filter((a) => a.status === "cancelled").length;

    return [
      { name: "Confirmadas", value: confirmed },
      { name: "Completadas", value: completed },
      { name: "No-shows",    value: noShow },
      { name: "Canceladas",  value: cancelled },
    ].filter(d => d.value > 0);
  }, [appointments]);

  const getStatusColor = (name: string) => {
    if (isDark) {
      if (name === "Confirmadas") return "#38BDF8";
      if (name === "Completadas") return colors.completed;
      if (name === "No-shows")    return "#F43F5E";
      if (name === "Canceladas")  return colors.destructive;
      return colors.secondary;
    } else {
      // Light Mode specific colors
      if (name === "Confirmadas") return "#0284C7"; // Dental Blue
      if (name === "Completadas") return "#7C3AED"; // Purple
      if (name === "No-shows")    return "#D97706"; // Amber
      if (name === "Canceladas")  return "#DC2626"; // Red
      return "#64748B";
    }
  };

  // 3. Pacientes nuevos por mes
  const patientsData = useMemo(() => {
    const last6Months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date(),
    });

    return last6Months.map((month) => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const count = patients.filter((p) => {
        const d = new Date(p.created_at);
        return isWithinInterval(d, { start, end });
      }).length;

      return {
        name: format(month, "MMM", { locale: es }).toUpperCase(),
        nuevos: count,
      };
    });
  }, [patients]);

  const noShowRate = useMemo(() => {
    const total = appointments.length;
    if (total === 0) return 0;
    const noShows = appointments.filter(a => a.status === "no_show").length;
    return Math.round((noShows / total) * 100);
  }, [appointments]);

  if (!mounted) return null;

  const chartStroke = isDark ? "#38BDF8" : "#0284C7";
  const chartFill = isDark ? "rgba(56, 189, 248, 0.10)" : "rgba(2, 132, 199, 0.08)";
  const axisColor = isDark ? "rgba(255, 255, 255, 0.4)" : colors.secondary;

  return (
    <div className="space-y-10 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight transition-colors">Análisis y reportes</h1>
        <p className="text-sm text-[var(--text-secondary)] font-semibold mt-1 transition-colors">Monitoreo de métricas clave de la clínica</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm rounded-[24px] p-6 transition-all">
          <CardHeader className="flex flex-row items-center justify-between p-0 mb-6 space-y-0">
            <CardTitle className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] transition-colors">Total citas</CardTitle>
            <div className="w-12 h-12 bg-[#0284C7]/15 rounded-2xl flex items-center justify-center transition-colors">
              <Calendar className="w-6 h-6 text-[#0284C7] dark:text-[#38BDF8]" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="text-4xl font-black text-[var(--text-primary)] tabular-nums tracking-tighter transition-colors">{appointments.length}</div>
            <p className="text-[11px] text-[var(--text-secondary)] font-bold mt-2 uppercase transition-colors">Histórico registrado</p>
          </CardContent>
        </Card>
        <Card className="bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm rounded-[24px] p-6 transition-all">
          <CardHeader className="flex flex-row items-center justify-between p-0 mb-6 space-y-0">
            <CardTitle className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] transition-colors">Tasa de no-show</CardTitle>
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              noShowRate <= 10 ? "bg-[#10B981] bg-opacity-[0.15]" : "bg-[#DC2626] bg-opacity-[0.15]"
            )}>
              <UserMinus className={cn("w-6 h-6", noShowRate <= 10 ? "text-[#10B981]" : "text-[#DC2626]")} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className={cn(
              "text-4xl font-black tabular-nums tracking-tighter transition-colors",
              noShowRate <= 10 ? "text-[var(--brand-accent)]" : "text-[var(--destructive)]"
            )}>{noShowRate}%</div>
            <p className="text-[11px] text-[var(--text-secondary)] font-bold mt-2 uppercase transition-colors">Inasistencia promedio</p>
          </CardContent>
        </Card>
        <Card className="bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm rounded-[24px] p-6 transition-all">
          <CardHeader className="flex flex-row items-center justify-between p-0 mb-6 space-y-0">
            <CardTitle className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] transition-colors">Pacientes totales</CardTitle>
            <div className="w-12 h-12 bg-[#0284C7]/15 rounded-2xl flex items-center justify-center transition-colors">
              <Users className="w-6 h-6 text-[#0284C7] dark:text-[#38BDF8]" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="text-4xl font-black text-[var(--text-primary)] tabular-nums tracking-tighter transition-colors">{patients.length}</div>
            <p className="text-[11px] text-[var(--text-secondary)] font-bold mt-2 uppercase transition-colors">Directorio activo</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Appointments Chart */}
        <Card className="bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm rounded-[32px] p-8 transition-all">
          <CardHeader className="p-0 mb-8">
            <CardTitle className="text-sm font-black text-[var(--text-primary)] flex items-center gap-3 uppercase tracking-tight transition-colors">
              <TrendingUp className="w-5 h-5 text-[var(--brand-accent)]" />
              Citas por mes
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-secondary)] font-medium mt-1 transition-colors">Volumen de actividad en los últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] p-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartStroke} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={chartStroke} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={axisColor} opacity={0.1} />
                <XAxis dataKey="name" stroke={axisColor} fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke={axisColor} fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: colors.sidebar, border: "none", fontSize: "12px", borderRadius: "16px", color: "#fff", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}
                  itemStyle={{ color: chartStroke, fontWeight: "bold" }}
                  cursor={{ stroke: chartStroke, strokeWidth: 2 }}
                />
                <Area type="monotone" dataKey="total" stroke={chartStroke} strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Patients Growth Chart */}
        <Card className="bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm rounded-[32px] p-8 transition-all">
          <CardHeader className="p-0 mb-8">
            <CardTitle className="text-sm font-black text-[var(--text-primary)] flex items-center gap-3 uppercase tracking-tight transition-colors">
              <Users className="w-5 h-5 text-[var(--brand-accent)]" />
              Pacientes nuevos
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-secondary)] font-medium mt-1 transition-colors">Crecimiento mensual del directorio</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] p-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={patientsData}>
                <defs>
                  <linearGradient id="colorNuevos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartStroke} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={chartStroke} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={axisColor} opacity={0.1} />
                <XAxis dataKey="name" stroke={axisColor} fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke={axisColor} fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: colors.sidebar, border: "none", fontSize: "12px", borderRadius: "16px", color: "#fff", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}
                  itemStyle={{ color: chartStroke, fontWeight: "bold" }}
                />
                <Area type="monotone" dataKey="nuevos" stroke={chartStroke} strokeWidth={4} fillOpacity={1} fill="url(#colorNuevos)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribution Pie Chart */}
        <Card className="bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm rounded-[32px] p-8 lg:col-span-2 transition-all">
          <CardHeader className="p-0 mb-8">
            <CardTitle className="text-sm font-black text-[var(--text-primary)] uppercase tracking-tight transition-colors">Distribución de estatus</CardTitle>
            <CardDescription className="text-xs text-[var(--text-secondary)] font-medium mt-1 transition-colors">Eficiencia operativa de la clínica</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] p-0 flex flex-col md:flex-row items-center justify-around">
            <div className="w-full h-full max-w-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getStatusColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: colors.sidebar, border: "none", fontSize: "12px", borderRadius: "16px", color: "#fff" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-6 mt-8 md:mt-0 min-w-[200px]">
              {statusData.map((d) => {
                const itemColor = getStatusColor(d.name);
                return (
                  <div key={d.name} className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 last:border-0 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: itemColor }} />
                      <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider transition-colors">{d.name}</span>
                    </div>
                    <span className="text-base font-black text-[var(--text-primary)] tabular-nums leading-none transition-colors">{d.value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
