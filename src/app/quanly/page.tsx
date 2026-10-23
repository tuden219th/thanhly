"use client";

import Link from "next/link";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Product = {

  id: string;

  product_code: string | null;

  name: string;

  price: number;

  stock_quantity: number;

  description: string;

  image_url: string | null;

  created_at?: string;

  updated_at?: string;

  deleted_at?: string | null;

  deleted_by?: string | null;

};

const MAX_IMAGE_SIZE = 1 * 1024 * 1024;

const MAX_ORIGINAL_SIZE = 25 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 1600;

const DELETE_BACKUP_WINDOW_MS = 48 * 60 * 60 * 1000;

const productSelect =

  "id, product_code, name, price, stock_quantity, description, image_url, created_at, updated_at, deleted_at, deleted_by";

function formatRemainingTime(deletedAt: string): string {

  const deletedAtMs = new Date(deletedAt).getTime();

  const remainingMs = deletedAtMs + DELETE_BACKUP_WINDOW_MS - Date.now();

  if (remainingMs <= 0) {

   return "Đã hết hạn";

  }

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));

  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 24) {

   const days = Math.floor(hours / 24);

   const remainingHours = hours % 24;

   return `${days} ngày ${remainingHours} giờ còn lại`;

  }

  return `${hours} giờ ${minutes} phút còn lại`;

}

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

  const [stockQuantity, setStockQuantity] = useState("1");

  const [description, setDescription] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);

  const [preview, setPreview] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [deletedProducts, setDeletedProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [saleQuantities, setSaleQuantities] = useState<Record<string, string>>({});
  const [sellingProductId, setSellingProductId] = useState<string | null>(null);

  const money = (value: number) =>

    new Intl.NumberFormat("vi-VN").format(value) + " ₫";

  async function loadProducts() {

    const { data, error } = await supabase

      .from("products")

      .select(productSelect)

      .is("deleted_at", null)

      .order("created_at", { ascending: false });

    if (error) {

      setMessage("Không tải được sản phẩm: " + error.message);

      return;

    }

    const { data: deletedData, error: deletedError } = await supabase

      .from("products")

      .select(productSelect)

      .not("deleted_at", "is", null)

      .order("deleted_at", { ascending: false });

    if (deletedError) {

      setMessage("Không tải được danh sách sản phẩm đã xóa: " + deletedError.message);

      return;

    }

    setProducts((data || []) as Product[]);

    setDeletedProducts((deletedData || []) as Product[]);

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

    setStockQuantity("1");

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

    setStockQuantity(String(product.stock_quantity ?? 1));

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

    const quantity = Number(stockQuantity);

    if (!Number.isInteger(quantity) || quantity < 0) {

      setMessage("Số lượng tồn kho phải là số nguyên không âm.");

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

            stock_quantity: quantity,

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

          stock_quantity: quantity,

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

  async function sellProduct(product: Product) {
    const rawQuantity = saleQuantities[product.id] ?? "1";
    const quantity = Number(rawQuantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage("Số lượng bán phải là số nguyên lớn hơn 0.");
      return;
    }

    if (quantity > product.stock_quantity) {
      setMessage(
        `Không đủ tồn kho "${product.name}". Hiện còn ${product.stock_quantity} sản phẩm.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Xác nhận bán ${quantity} sản phẩm "${product.name}"? Tồn kho hiện tại: ${product.stock_quantity}.`
    );

    if (!confirmed) return;

    setSellingProductId(product.id);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("decrease_product_stock", {
        p_product_id: product.id,
        p_quantity: quantity,
      });

      if (error) throw error;

      await loadProducts();
      setSaleQuantities((current) => ({ ...current, [product.id]: "1" }));
      setMessage(
        `Đã xác nhận bán ${quantity} sản phẩm "${product.name}". Tồn kho còn ${Number(data)} sản phẩm.`
      );
    } catch (error: unknown) {
      console.error("Lỗi xác nhận bán:", error);
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Không xác định được nguyên nhân.";

      setMessage("Không xác nhận được giao dịch bán: " + detail);
    } finally {
      setSellingProductId(null);
    }
  }

  async function deleteProduct(product: Product) {

    const confirmed = window.confirm(

      `Bạn có chắc chắn muốn xóa "${product.name}"? Sản phẩm sẽ được giữ trong kho lưu trữ trong 48 giờ và có thể khôi phục lại.`

    );

    if (!confirmed) return;

    try {

      const { error } = await supabase

        .from("products")

        .update({

          deleted_at: new Date().toISOString(),

          deleted_by: (await supabase.auth.getSession()).data.session?.user?.id ?? null,

        })

        .eq("id", product.id)

        .is("deleted_at", null);

      if (error) {

        throw error;

      }

      if (editingId === product.id) {

        resetForm();

      }

      await loadProducts();

      setMessage("Đã xóa sản phẩm. Bạn còn 48 giờ để khôi phục.");

    } catch (error: unknown) {

      console.error("Lỗi xóa sản phẩm:", error);

      const detail =

        error instanceof Error

          ? error.message

          : typeof error === "string"

            ? error

            : "Không xác định được nguyên nhân.";

      setMessage("Không xóa được sản phẩm: " + detail);

    }

  }

  async function restoreProduct(product: Product) {

    if (!product.deleted_at) {

      setMessage("Sản phẩm này không nằm trong danh sách đã xóa.");

      return;

    }

    const deletedAtMs = new Date(product.deleted_at).getTime();

    const nowMs = new Date().getTime();

    if (Number.isNaN(deletedAtMs) || deletedAtMs + DELETE_BACKUP_WINDOW_MS <= nowMs) {

      const { error } = await supabase

        .from("products")

        .update({ deleted_at: null, deleted_by: null })

        .eq("id", product.id)

        .not("deleted_at", "is", null);

      if (error) {

        console.error("Lỗi khi cập nhật backup hết hạn:", error);

      }

      await loadProducts();

      setMessage("Backup đã hết hạn và không còn khả dụng để khôi phục.");

      return;

    }

    try {

      const { error } = await supabase

        .from("products")

        .update({

          deleted_at: null,

          deleted_by: null,

          updated_at: new Date().toISOString(),

        })

        .eq("id", product.id)

        .not("deleted_at", "is", null);

      if (error) {

        throw error;

      }

      await loadProducts();

      setMessage("Đã khôi phục sản phẩm thành công.");

    } catch (error: unknown) {

      console.error("Lỗi khôi phục sản phẩm:", error);

      const detail =

        error instanceof Error

          ? error.message

          : typeof error === "string"

            ? error

            : "Không xác định được nguyên nhân.";

      setMessage("Không khôi phục được sản phẩm: " + detail);

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

          <Link href="/" className="text-xl font-bold tracking-tight">

            <span className="text-[#c96a2b]">Từ Đến</span> Thanh Lý

          </Link>

          <div className="flex items-center gap-3">

            <Link

              href="/"

              className="text-sm text-neutral-600 hover:text-[#c96a2b]"

            >

              Xem website

            </Link>

            <Link

              href="/quanly/tin-nhan"

              className="rounded-lg border border-[#c96a2b]/25 bg-[#fffaf6] px-3 py-2 text-sm font-semibold text-[#a94f1f] hover:bg-[#fff2e7]"

            >

              Hộp thư tư vấn

            </Link>

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

                Số lượng tồn kho

                <input

                  type="number"

                  min="0"

                  step="1"

                  value={stockQuantity}

                  onChange={(event) => setStockQuantity(event.target.value)}

                  placeholder="Nhập số lượng tồn kho"

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

            {deletedProducts.length > 0 && (

              <section className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">

                <div className="flex items-center justify-between gap-3">

                  <div>

                    <h2 className="text-lg font-semibold text-amber-900">

                      Sản phẩm đã xóa

                    </h2>

                    <p className="mt-1 text-sm text-amber-800/80">

                      Có thể khôi phục trong 48 giờ kể từ thời điểm xóa. Sau đó sẽ bị xoá khỏi hệ thống.

                    </p>

                  </div>

                </div>

                <div className="mt-4 space-y-3">

                  {deletedProducts.map((item) => (

                    <div

                      key={item.id}

                      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"

                    >

                      <div className="flex items-center gap-3">

                        {item.image_url ? (

                          // eslint-disable-next-line @next/next/no-img-element

                          <img

                            src={item.image_url}

                            alt={item.name}

                            className="h-14 w-14 rounded-lg object-cover"

                          />

                        ) : (

                          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-neutral-100 text-xl text-neutral-300">

                            ◇

                          </div>

                        )}

                        <div>

                          <p className="font-medium text-neutral-800">{item.name}</p>

                          <p className="text-xs text-neutral-500">

                            Xóa lúc: {item.deleted_at ? new Date(item.deleted_at).toLocaleString("vi-VN") : "Chưa rõ"}

                          </p>

                          <p className="text-xs text-amber-700">

                            {item.deleted_at ? formatRemainingTime(item.deleted_at) : "Đã hết hạn"}

                          </p>

                        </div>

                      </div>

                      <button

                        type="button"

                        onClick={() => restoreProduct(item)}

                        className="rounded-lg border border-[#c96a2b] bg-[#fff7f1] px-3 py-2 text-sm font-medium text-[#c96a2b] transition hover:bg-[#fef0e1]"

                      >

                        Khôi phục

                      </button>

                    </div>

                  ))}

                </div>

              </section>

            )}

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
                    <p className={`mt-1 text-sm font-medium ${product.stock_quantity > 0 ? "text-emerald-700" : "text-red-600"}`}>
                      Tồn kho: {product.stock_quantity}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        max={product.stock_quantity}
                        value={saleQuantities[product.id] ?? "1"}
                        onChange={(event) =>
                          setSaleQuantities((current) => ({
                            ...current,
                            [product.id]: event.target.value,
                          }))
                        }
                        aria-label={`Số lượng bán ${product.name}`}
                        className="w-20 min-w-0 rounded-lg border border-neutral-200 px-2 py-2 text-sm outline-none focus:border-[#c96a2b]"
                      />
                      <button
                        type="button"
                        onClick={() => void sellProduct(product)}
                        disabled={
                          product.stock_quantity <= 0 ||
                          sellingProductId !== null
                        }
                        className="flex-1 rounded-lg bg-[#294a3a] px-2 py-2 text-sm font-medium text-white transition hover:bg-[#20392d] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sellingProductId === product.id ? "Đang bán..." : "Xác nhận bán"}
                      </button>
                    </div>
                    <button

                      onClick={() => editProduct(product)}

                      className="mt-3 w-full rounded-lg border border-neutral-200 py-2 text-sm hover:border-[#c96a2b]"

                    >

                      Chỉnh sửa

                    </button>

                    <button

                      type="button"

                      onClick={() => deleteProduct(product)}

                      className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-100"

                    >

                      Xóa

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
