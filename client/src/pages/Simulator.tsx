import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, User, LogOut, Settings, Shield } from "lucide-react";
import { toast } from "sonner";

export default function Simulator() {
  const [, navigate] = useLocation();
  const { data: user, isLoading, error } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logout realizado com sucesso!");
      navigate("/login");
    },
  });

  // Redireciona para login se não autenticado
  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-900">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header com menu do usuário */}
      <header className="bg-emerald-800 text-white px-4 py-2 flex items-center justify-between shadow-lg z-50">
        <div className="flex items-center gap-3">
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663029272800/tnDZCsVDIEriwmEa.png" alt="SIPP" className="h-10 w-10 rounded-lg" />
          <div>
            <h1 className="font-bold text-lg">SIPP-BIM LAB</h1>
            <p className="text-xs text-emerald-200">Simulador de Preços de Projetos BIM</p>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="text-white hover:bg-emerald-700">
              <User className="mr-2 h-4 w-4" />
              {user.name || user.email}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <Settings className="mr-2 h-4 w-4" />
              Meu Perfil
            </DropdownMenuItem>
            {user.role === "admin" && (
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <Shield className="mr-2 h-4 w-4" />
                Painel Admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => logoutMutation.mutate()}
              className="text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Iframe com o simulador original */}
      <iframe
        src="/simulator.html"
        className="flex-1 w-full border-0"
        title="Simulador SIPP-BIM"
      />
    </div>
  );
}
