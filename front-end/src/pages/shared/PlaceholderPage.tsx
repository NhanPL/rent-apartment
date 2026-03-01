interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p>Trang đang được xây dựng theo roadmap dự án.</p>
    </div>
  )
}
