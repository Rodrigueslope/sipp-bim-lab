import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        navigate("/simulator");
      } else {
        navigate("/login");
      }
    }
  }, [isLoading, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-900">
      <Loader2 className="h-8 w-8 animate-spin text-white" />
    </div>
  );
}
