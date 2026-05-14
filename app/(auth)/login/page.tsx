"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Credenciales incorrectas. Intenta de nuevo.");
      setIsLoading(false);
      return;
    }

    router.push("/");
  };

  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 bg-white rounded-sm flex items-center justify-center">
              <span className="text-black font-black text-sm">R</span>
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Ravyn CRM
          </h1>
          <p className="text-sm text-gray-400">
            Gestión de clínicas, reinventada.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-300 text-sm font-medium">
              Correo electrónico
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@clinica.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-gray-900 border-gray-800 text-white placeholder:text-gray-600 focus:border-gray-600 focus:ring-0 h-11"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-gray-300 text-sm font-medium">
                Contraseña
              </Label>
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-gray-900 border-gray-800 text-white placeholder:text-gray-600 focus:border-gray-600 focus:ring-0 h-11"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-white text-black font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Iniciando sesión..." : "Iniciar sesión"}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-600">
          Al iniciar sesión aceptas los{" "}
          <span className="text-gray-400 hover:text-white cursor-pointer transition-colors">
            términos de servicio
          </span>
        </p>
      </div>
    </main>
  );
}
