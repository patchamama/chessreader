interface BannerProps {
  version: string
}

export default function Banner({ version }: BannerProps) {
  return (
    <header data-testid="banner">
      <span>{version}</span>
    </header>
  )
}
