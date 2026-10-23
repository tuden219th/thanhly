
"use client";

import { useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  image?: string;
};

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleImage(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function saveProduct() {
    if (!name.trim() || Number(price) < 0 || price.trim() === "") {
      alert("Vui lòng nhập tên và giá hợp lệ.");
      return;
    }

    const product: Product = {
      id: editingId || `TD-${String(Date.now()).slice(-6)}`,
      name: name.trim(),
      price: Number(price),
      image,
    };

    setProducts((current) =>
      editingId
        ? current.map((item) => item.id === editingId ? product : item)
        : [...current, product]
    );

    setName("");
    setPrice("");
    setImage("");
    setEditingId(null);
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setName(product.name);
    setPrice(String(product.price));
    setImage(product.image || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportExcel() {
    const rows = [
      ["Mã sản phẩm", "Tên sản phẩm", "Giá bán"],
      ...products.map((p) => [p.id, p.name, String(p.price)]),
    ];

    const csv = "\uFEFF" + rows.map((row) =>
      row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
    ).join("\r\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "danh-sach-thanh-ly.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const money = (value: number) =>
    new Intl.NumberFormat("vi-VN").format(value) + " ₫";

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-[#24231f]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a href="/" className="text-xl font-bold tracking-tight">
            <span className="text-[#c96a2b]">Từ Đến</span> Thanh Lý
          </a>
          <span className="text-sm text-neutral-500">Danh sách sản phẩm</span>
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

        <section className="mb-12 rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="mb-5 text-lg font-semibold">
            {editingId ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center hover:border-[#c96a2b]">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="Ảnh sản phẩm" className="mb-3 h-44 w-full rounded-lg object-contain" />
              ) : (
                <div className="py-10">
                  <span className="text-3xl">＋</span>
                  <p className="mt-2 font-medium">Chụp hoặc chọn ảnh</p>
                </div>
              )}
              <span className="text-sm text-[#c96a2b]">
                {image ? "Chọn ảnh khác" : "Mở camera / thư viện ảnh"}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-3 block w-full text-sm"
                onChange={(e) => handleImage(e.target.files?.[0])}
              />
            </label>

            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium">
                Tên sản phẩm
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Bàn làm việc gỗ"
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-[#c96a2b]"
                />
              </label>
              <label className="text-sm font-medium">
                Giá bán (VNĐ)
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Ví dụ: 500000"
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-[#c96a2b]"
                />
              </label>
              {editingId && (
                <p className="text-sm text-neutral-500">
                  Mã sản phẩm: {editingId}
                </p>
              )}
              <button
                onClick={saveProduct}
                className="mt-auto rounded-xl bg-[#c96a2b] px-5 py-3 font-semibold text-white transition hover:bg-[#ad5721]"
              >
                {editingId ? "Lưu chỉnh sửa" : "Lưu sản phẩm"}
              </button>
              {editingId && (
                <button
                  onClick={() => {
                    setEditingId(null);
                    setName("");
                    setPrice("");
                    setImage("");
                  }}
                  className="rounded-xl border border-neutral-200 px-5 py-3"
                >
                  Hủy chỉnh sửa
                </button>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Sản phẩm thanh lý</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {products.length} sản phẩm
              </p>
            </div>
            <button
              onClick={exportExcel}
              disabled={!products.length}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              Xuất danh sách CSV
            </button>
          </div>

          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center text-neutral-500">
              Chưa có sản phẩm. Hãy chụp ảnh và thêm sản phẩm đầu tiên.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <article key={product.id} className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
                  <div className="relative flex aspect-square items-center justify-center bg-neutral-100">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-4xl text-neutral-300">◇</span>
                    )}
                    <div className="absolute bottom-2 left-2 max-w-[90%] rounded-lg bg-white/95 px-3 py-2 shadow">
                      <p className="text-xs text-neutral-500">{product.id}</p>
                      <p className="line-clamp-2 text-sm font-semibold">{product.name}</p>
                      <p className="text-sm font-bold text-[#c96a2b]">{money(product.price)}</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 min-h-10 text-sm font-medium">{product.name}</p>
                    <p className="mt-1 font-bold text-[#c96a2b]">{money(product.price)}</p>
                    <button
                      onClick={() => editProduct(product)}
                      className="mt-3 w-full rounded-lg border border-neutral-200 py-2 text-sm hover:border-[#c96a2b]"
                    >
                      Chỉnh sửa
                    </button>
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
