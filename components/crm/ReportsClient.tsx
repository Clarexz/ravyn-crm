"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, UserMinus, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import type { Appointment, Patient } from "@/types/database";

interface ReportsClientProps {
  appointments: Appointment[];
  patients: Patient[];
}

const COLORS = ["#10b981", "#f97316", "#ef4444", "#3b82f6"];

export default function ReportsClient({ appointments, patients }: ReportsClientProps) {
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
      { name: "Completadas", value: completed },
      { name: "No-shows", value: noShow },
      { name: "Canceladas", value: cancelled },
      { name: "Confirmadas", value: confirmed },
    ].filter(d => d.value > 0);
  }, [appointments]);

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

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-xl font-bold text-foreground">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Análisis de rendimiento de la clínica</p>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Citas</CardTitle>
            <Calendar className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{appointments.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Histórico registrado</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tasa de No-show</CardTitle>
            <UserMinus className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{noShowRate}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">Inasistencia promedio</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pacientes Totales</CardTitle>
            <Users className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{patients.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Directorio activo</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appointments Chart */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Citas por Mes
            </CardTitle>
            <CardDescription className="text-xs">Volumen de actividad en los últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: "12px", borderRadius: "8px" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Patients Growth Chart */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />
              Pacientes Nuevos
            </CardTitle>
            <CardDescription className="text-xs">Crecimiento mensual del directorio</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={patientsData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: "12px", borderRadius: "8px" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Line type="monotone" dataKey="nuevos" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribution Pie Chart */}
        <Card className="bg-card border-border shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold">Distribución por Estado</CardTitle>
            <CardDescription className="text-xs">Porcentaje de éxito y cancelación de citas</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col md:flex-row items-center justify-around">
            <div className="w-full h-full max-w-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: "12px", borderRadius: "8px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap md:flex-col gap-4 mt-4 md:mt-0">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-medium text-foreground">{d.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{d.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
