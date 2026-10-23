
"use client";

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
          "id, product_code, name, price, description, image_url, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Lỗi tải danh sách sản phẩm:", error);
        setError("Chưa tải được danh sách sản phẩm. Vui lòng thử tải lại trang.");
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
          <a href="/" className="text-xl font-bold tracking-tight">
            <span className="text-[#c96a2b]">Từ Đến</span> Thanh Lý
          </a>
          <a
            href="/quanly/login"
            className="text-sm text-neutral-500 transition hover:text-[#c96a2b]"
          >
            Quản lý
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10">
        <section className="mb-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#c96a2b]">
            Thanh lý minh bạch
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Đồ tốt, giá hợp lý.
          </h1>
          <p className="mt-3 text-neutral-500">
            Danh sách đồ thanh lý được cập nhật trực tiếp.
          </p>
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
