export default function BrokenView(): never {
  throw new Error('This component is intentionally broken to showcase ErrorBoundary')
}
