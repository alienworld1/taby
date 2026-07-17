import Image from "next/image";

type BrandMarkProps = {
  variant: "mark" | "wordmark";
  className?: string;
};

const brandAssets = {
  mark: {
    height: 323,
    src: "/images/logo.png",
    width: 322,
  },
  wordmark: {
    height: 279,
    src: "/images/logo-with-wordmark.png",
    width: 793,
  },
} as const;

export function BrandMark({ className, variant }: BrandMarkProps) {
  const asset = brandAssets[variant];

  return (
    <Image
      alt="Taby"
      className={className}
      height={asset.height}
      src={asset.src}
      width={asset.width}
    />
  );
}
