import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import ChatWidget from "@/components/ChatWidget";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://thanhly.tudencafe.com"),
  applicationName: "Thanh Lý Từ Đến",
  title: {
    default: "Thanh Lý Từ Đến | Đồ tốt, giá hợp lý",
    template: "%s | Thanh Lý Từ Đến",
  },
  description:
    "Thanh Lý Từ Đến mang đến những món đồ tốt, giá hợp lý và cập nhật thường xuyên, giúp khách hàng dễ dàng tìm kiếm sản phẩm thanh lý phù hợp.",
  keywords: [
    "thanh lý",
    "đồ thanh lý",
    "mua đồ cũ",
    "mua bán đồ thanh lý",
    "thanh lý từ đến",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Thanh Lý Từ Đến",
    description:
      "Mua sắm đồ thanh lý chất lượng với giá hợp lý, đa dạng sản phẩm và cập nhật nhanh chóng.",
    url: "https://thanhly.tudencafe.com/",
    siteName: "Thanh Lý Từ Đến",
    locale: "vi_VN",
    type: "website",
    images: [
      {
        url: "/icon.svg",
        width: 512,
        height: 512,
        alt: "Thanh Lý Từ Đến",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Thanh Lý Từ Đến",
    description:
      "Khám phá các sản phẩm thanh lý chất lượng với giá hợp lý tại Thanh Lý Từ Đến.",
    images: ["/icon.svg"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  verification: {
    google: "zDnk6b-DpF_qB1RRhoWkx4u0csbAvkhAK9VKaf0SdL0",
  },
};

export const viewport = {
  themeColor: "#c96a2b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
