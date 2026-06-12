import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Norte startup error', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-recovery">
          <div className="recovery-mark">N</div>
          <span>Norte</span>
          <h1>Nao conseguimos abrir sua carteira.</h1>
          <p>Seus dados continuam seguros. Atualize a experiencia para tentarmos carregar novamente.</p>
          <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
          <a href="/?demo=1">Entrar no modo demonstracao</a>
        </main>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister())
    }).catch(() => {})
  })
}
