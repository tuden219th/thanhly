"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        setError("Đăng nhập thất bại. Vui lòng kiểm tra email và mật khẩu.");
        return;
      }

      router.replace("/quanly");
    } catch {
      setError("Có lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f3] px-5 py-10 text-[#24231f]">
      <section className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-7 shadow-sm sm:p-9">
        <a href="/" className="text-xl font-bold tracking-tight">
          <span className="text-[#c96a2b]">Từ Đến</span> Thanh Lý
        </a>

        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-[#c96a2b]">
          Khu vực quản lý
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Đăng nhập
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          Đăng nhập để quản lý sản phẩm thanh lý.
        </p>

        <form onSubmit={handleLogin} className="mt-7 space-y-5">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email quản lý"
              className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-[#c96a2b]"
            />
          </label>

          <label className="block text-sm font-medium">
            Mật khẩu
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-[#c96a2b]"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#c96a2b] px-5 py-3 font-semibold text-white transition hover:bg-[#ad5721] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <a
          href="/"
          className="mt-6 block text-center text-sm text-neutral-500 hover:text-[#c96a2b]"
        >
          ← Quay lại trang chủ
        </a>
      </section>
    </main>
  );
}
