interface Props { src?: string | null }

export function VietQrDisplay({ src }: Props) {
  if (!src) return null
  return <img src={src} alt="VietQR bank transfer" loading="lazy" decoding="async" className="invoice-vietqr" />
}
