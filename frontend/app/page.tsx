"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "./src/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        router.push("/gallery");
      } else {
        router.push("/auth");
      }
    };

    checkAuth();
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );
}
