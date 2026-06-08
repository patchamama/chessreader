import { APP_VERSION } from './version'
import Banner from './components/Banner'

export default function App() {
  return (
    <div>
      <Banner version={APP_VERSION} />
      <main>
        <p>Chess Ebook Parser</p>
      </main>
    </div>
  )
}
