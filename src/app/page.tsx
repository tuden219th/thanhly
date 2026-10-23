
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  product_code: string | null;
  name: string;
  price: number;
  description: string;
  image_url: string | null;
  created_at: string;
  stock_quantity: number | null;
};

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const money = (value: number) =>
    new Intl.NumberFormat("vi-VN").format(value) + " ₫";

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("products")
        .select(
          "id, product_code, name, price, description, image_url, created_at, stock_quantity"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Lỗi tải danh sách sản phẩm:", error);
        setError(
          "Chưa tải được danh sách sản phẩm. Vui lòng thử tải lại trang."
        );
      } else {
        setProducts((data || []) as Product[]);
      }

      setLoading(false);
    }

    void loadProducts();
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-[#24231f]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="text-[#c96a2b]">Từ Đến</span> Thanh Lý
          </Link>

          <Link
            href="/quanly/login"
            className="text-sm text-neutral-500 transition hover:text-[#c96a2b]"
          >
            Quản lý
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10">
        <section className="relative isolate mb-12 overflow-hidden rounded-[2rem] bg-[#25231f] p-6 text-white shadow-xl sm:p-9 lg:p-10">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-[#c96a2b]/35 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-36 left-1/3 -z-10 h-72 w-72 rounded-full bg-[#f0a35e]/15 blur-3xl"
          />

          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-orange-100">
                <span aria-hidden="true">✦</span> Thanh lý minh bạch · Nghĩa Đô
              </p>

              <h1 className="mt-5 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Đồ tốt, giá hợp lý.
                <span className="mt-1 block text-[#ffc28e]">Gọi là có người hỗ trợ!</span>
              </h1>

              <p className="mt-4 max-w-lg text-sm leading-6 text-white/70 sm:text-base">
                Danh sách đồ thanh lý được cập nhật trực tiếp. Gọi cho Từ Đến để hỏi nhanh về sản phẩm hoặc ghé cửa hàng xem tận nơi.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <a
                  href="tel:0988242921"
                  className="group flex min-h-16 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 transition hover:border-[#ffc28e]/70 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffc28e]"
                >
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c96a2b] text-lg">☎</span>
                  <span>
                    <span className="block text-xs font-medium text-white/60">Gọi tư vấn</span>
                    <span className="mt-0.5 block font-bold tracking-wide">0988 242 921</span>
                  </span>
                </a>
                <a
                  href="tel:0972516250"
                  className="group flex min-h-16 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 transition hover:border-[#ffc28e]/70 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffc28e]"
                >
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c96a2b] text-lg">☎</span>
                  <span>
                    <span className="block text-xs font-medium text-white/60">Hoặc gọi</span>
                    <span className="mt-0.5 block font-bold tracking-wide">0972 516 250</span>
                  </span>
                </a>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white p-5 text-[#24231f] shadow-lg sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c96a2b]">
                📍 Địa chỉ cửa hàng
              </p>
              <p className="mt-3 text-xl font-bold leading-snug sm:text-2xl">
                219 Tô Hiệu, Nghĩa Đô, Hà Nội
              </p>
              <a
                href="https://www.google.com/maps/search/?api=1&query=219%20T%C3%B4%20Hi%E1%BB%87u%2C%20Ngh%C4%A9a%20%C4%90%C3%B4%2C%20H%C3%A0%20N%E1%BB%99i"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#fff2e7] px-4 py-2.5 text-sm font-bold text-[#a94f1f] transition hover:bg-[#ffe4cf] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c96a2b]"
              >
                Mở bản đồ <span aria-hidden="true">↗</span>
              </a>
              <div className="mt-5 border-t border-neutral-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Địa chỉ cũ</p>
                <p className="mt-1 text-sm text-neutral-600">Dịch Vọng, Cầu Giấy, Hà Nội</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Sản phẩm thanh lý</h2>

            <p className="mt-1 text-sm text-neutral-500">
              {loading ? "Đang tải sản phẩm..." : `${products.length} sản phẩm`}
            </p>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-black/5 bg-white py-16 text-center text-neutral-500">
              Đang tải danh sách sản phẩm...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-white py-12 text-center">
              <p className="text-sm text-red-700">{error}</p>

              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:border-[#c96a2b]"
              >
                Tải lại trang
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center text-neutral-500">
              Hiện chưa có sản phẩm thanh lý.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="relative flex aspect-square items-center justify-center bg-neutral-100">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl text-neutral-300">◇</span>
                    )}
                  </div>

                  <div className="p-3">
                    <p className="line-clamp-2 min-h-10 text-sm font-medium">
                      {product.name}
                    </p>
 
                    <p className="mt-1 font-bold text-[#c96a2b]">
                      {money(Number(product.price))}
                    </p>
 
                    <p
                      className={`mt-2 text-xs font-medium ${
                        Number(product.stock_quantity ?? 0) > 0
                          ? "text-emerald-700"
                          : "text-red-600"
                      }`}
                    >
                      {Number(product.stock_quantity ?? 0) > 0
                        ? `Còn ${Number(product.stock_quantity ?? 0)} sản phẩm`
                        : "Hết hàng"}
                    </p>
 
                    {product.description && (
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-neutral-500">
                        {product.description}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-16 border-t border-black/5 bg-white py-6 text-center text-sm text-neutral-500">
        Từ Đến · Thanh lý
      </footer>
    </main>
  );
}
