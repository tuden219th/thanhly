
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  product_code: string | null;
  name: string;
  price: number;
  description: string;
  image_url: string | null;
};

const MAX_IMAGE_SIZE = 1 * 1024 * 1024;
const MAX_ORIGINAL_SIZE = 25 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Tệp đã chọn không phải là ảnh."));
      return;
    }

    if (file.size > MAX_ORIGINAL_SIZE) {
      reject(
        new Error(
          "Ảnh gốc lớn hơn 25 MB. Hãy chọn ảnh nhỏ hơn hoặc chụp lại ảnh."
        )
      );
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = async () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight) {
          throw new Error("Không đọc được kích thước ảnh.");
        }

        const scale = Math.min(
          1,
          MAX_IMAGE_DIMENSION / Math.max(
            image.naturalWidth,
            image.naturalHeight
          )
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(
          1,
          Math.round(image.naturalWidth * scale)
        );
        canvas.height = Math.max(
          1,
          Math.round(image.naturalHeight * scale)
        );

        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
        }

        // Nền trắng để ảnh có nền trong suốt không bị chuyển thành màu đen.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        let quality = 0.82;
        let blob: Blob | null = null;

        // Giảm chất lượng dần nếu ảnh vẫn lớn hơn 1 MB.
        for (let attempt = 0; attempt < 6; attempt++) {
          blob = await new Promise<Blob | null>((resolveBlob) => {
            canvas.toBlob(resolveBlob, "image/jpeg", quality);
          });

          if (!blob) {
            throw new Error("Không thể nén ảnh này. Hãy thử ảnh khác.");
          }

          if (blob.size <= MAX_IMAGE_SIZE) break;

          quality -= 0.08;
        }

        if (!blob) {
          throw new Error("Không thể xử lý ảnh.");
        }

        const compressedFile = new File(
          [blob],
          `${file.name.replace(/\.[^.]+$/, "") || "product"}.jpg`,
          {
            type: "image/jpeg",
            lastModified: Date.now(),
          }
        );

        resolve(compressedFile);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          "Không đọc được ảnh. Hãy thử ảnh JPG hoặc PNG khác."
        )
      );
    };

    image.src = objectUrl;
  });
}

export default function ManagePage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const money = (value: number) =>
    new Intl.NumberFormat("vi-VN").format(value) + " ₫";

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Không tải được sản phẩm: " + error.message);
      return;
    }

    setProducts((data || []) as Product[]);
  }

  useEffect(() => {
    let active = true;

    async function init() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        router.replace("/quanly/login");
        return;
      }

      await loadProducts();

      if (active) setLoading(false);
    }

    void init();

    return () => {
      active = false;
    };
  }, [router]);

  function chooseImage(file?: File) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Vui lòng chọn một tệp ảnh.");
      return;
    }

    if (file.size > MAX_ORIGINAL_SIZE) {
      setMessage("Ảnh gốc quá lớn (trên 25 MB). Hãy chọn ảnh khác.");
      return;
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setMessage(
      `Đã chọn ảnh ${(file.size / (1024 * 1024)).toFixed(2)} MB. Ảnh sẽ được tự động nén khi lưu.`
    );
  }

  function resetForm() {
    setName("");
    setPrice("");
    setDescription("");
    setImageFile(null);
    setPreview("");
    setEditingId(null);
    setMessage("");
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setName(product.name);
    setPrice(String(product.price));
    setDescription(product.description || "");
    setPreview(product.image_url || "");
    setImageFile(null);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProduct() {
    if (
      !name.trim() ||
      price.trim() === "" ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0
    ) {
      setMessage("Vui lòng nhập tên và giá hợp lệ.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        router.replace("/quanly/login");
        return;
      }

      // Nếu không chọn ảnh mới, giữ nguyên URL ảnh hiện tại.
      let imageUrl = preview || null;

      if (imageFile) {
        setMessage("Đang nén ảnh...");

        const compressedFile = await compressImage(imageFile);

        setMessage(
          `Ảnh sau khi nén: ${(compressedFile.size / 1024).toFixed(0)} KB. Đang tải lên...`
        );

        const filePath = `${crypto.randomUUID()}.jpg`;

        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
          const uploadPromise = supabase.storage
            .from("product-images")
            .upload(filePath, compressedFile, {
              upsert: false,
              contentType: "image/jpeg",
              cacheControl: "3600",
            });

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(
                new Error(
                  "Tải ảnh quá 60 giây. Hãy kiểm tra kết nối mạng hoặc trạng thái Supabase Storage."
                )
              );
            }, 60000);
          });

          const { error: uploadError } = await Promise.race([
            uploadPromise,
            timeoutPromise,
          ]);

          if (uploadError) {
            throw new Error(
              "Không tải được ảnh lên Supabase: " + uploadError.message
            );
          }
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        const { data: publicData } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        imageUrl = publicData.publicUrl;
      }

      if (editingId) {
        const { error } = await supabase
          .from("products")
          .update({
            name: name.trim(),
            price: Number(price),
            description: description.trim(),
            image_url: imageUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);

        if (error) throw error;
      } else {
        const productCode = `TD-${Date.now().toString().slice(-8)}`;

        const { error } = await supabase.from("products").insert({
          product_code: productCode,
          name: name.trim(),
          price: Number(price),
          description: description.trim(),
          image_url: imageUrl,
        });

        if (error) throw error;
      }

      resetForm();
      await loadProducts();
      setMessage("Đã lưu sản phẩm thành công.");
    } catch (error: unknown) {
      console.error("Lỗi lưu sản phẩm:", error);

      const detail =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Không xác định được nguyên nhân.";

      setMessage("Không lưu được sản phẩm: " + detail);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/quanly/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f3] text-neutral-500">
        Đang kiểm tra đăng nhập...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-[#24231f]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <a href="/" className="text-xl font-bold tracking-tight">
            <span className="text-[#c96a2b]">Từ Đến</span> Thanh Lý
          </a>

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-sm text-neutral-600 hover:text-[#c96a2b]"
            >
              Xem website
            </a>
            <button
              onClick={logout}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10">
        <section className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#c96a2b]">
            Khu vực quản lý
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Quản lý sản phẩm
          </h1>
          <p className="mt-2 text-neutral-500">
            Chụp ảnh, cập nhật giá và quản lý đồ thanh lý.
          </p>
        </section>

        <section className="mb-10 rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="mb-5 text-lg font-semibold">
            {editingId ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center hover:border-[#c96a2b]">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Ảnh sản phẩm"
                  className="mb-3 h-52 w-full rounded-lg object-contain"
                />
              ) : (
                <div className="py-10">
                  <span className="text-3xl">＋</span>
                  <p className="mt-2 font-medium">Chụp hoặc chọn ảnh</p>
                </div>
              )}

              <span className="text-sm text-[#c96a2b]">
                {preview ? "Chọn ảnh khác" : "Mở camera / thư viện ảnh"}
              </span>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-3 block w-full text-sm"
                onChange={(event) => chooseImage(event.target.files?.[0])}
              />
            </label>

            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium">
                Tên sản phẩm
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
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
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="Ví dụ: 500000"
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-[#c96a2b]"
                />
              </label>

              <label className="text-sm font-medium">
                Mô tả
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Tình trạng và thông tin sản phẩm"
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-[#c96a2b]"
                />
              </label>

              {editingId && (
                <p className="text-sm text-neutral-500">
                  Mã sản phẩm:{" "}
                  {products.find((product) => product.id === editingId)
                    ?.product_code || editingId}
                </p>
              )}

              <button
                onClick={saveProduct}
                disabled={saving}
                className="mt-auto rounded-xl bg-[#c96a2b] px-5 py-3 font-semibold text-white transition hover:bg-[#ad5721] disabled:opacity-60"
              >
                {saving
                  ? "Đang xử lý..."
                  : editingId
                    ? "Lưu chỉnh sửa"
                    : "Lưu sản phẩm"}
              </button>

              {editingId && (
                <button
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-xl border border-neutral-200 px-5 py-3 disabled:opacity-60"
                >
                  Hủy chỉnh sửa
                </button>
              )}
            </div>
          </div>

          {message && (
            <p
              role="status"
              aria-live="polite"
              className="mt-5 break-words rounded-lg bg-neutral-50 p-3 text-sm"
            >
              {message}
            </p>
          )}
        </section>

        <section>
          <div className="mb-5">
            <h2 className="text-2xl font-semibold">
              Danh sách sản phẩm
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {products.length} sản phẩm
            </p>
          </div>

          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center text-neutral-500">
              Chưa có sản phẩm. Hãy thêm sản phẩm đầu tiên.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm"
                >
                  <div className="relative flex aspect-square items-center justify-center bg-neutral-100">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
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
    </main>
  );
}
