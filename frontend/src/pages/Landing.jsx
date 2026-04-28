import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, Sparkles, Shield, Zap, ArrowRight } from 'lucide-react'
import Button from '../components/Button'
import { authAPI } from '../lib/api'

export default function Landing() {
  const [setupRequired, setSetupRequired] = useState(false)

  useEffect(() => {
    // Check if admin setup is needed
    authAPI.checkSetup()
      .then(data => setSetupRequired(data.setup_required))
      .catch(() => {}) // Ignore errors — just don't show the banner
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Setup Banner */}
      {setupRequired && (
        <div className="bg-primary/10 border-b border-primary/20">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <p className="text-sm text-text-primary">
                <strong>First time?</strong> Create an admin account to get started.
              </p>
            </div>
            <Link to="/setup">
              <Button size="sm">Setup Admin</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="landing-nav border-b sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center micro-depth">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-text-primary">GradeMaster</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link to="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 micro-depth border border-primary/15">
            <Sparkles className="w-4 h-4" />
            AI-Powered Assessment Platform
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-text-primary leading-tight mb-6 text-balance">
            Transform Education with
            <span className="text-primary"> Intelligent Grading</span>
          </h1>
          <p className="text-xl text-text-secondary mb-10 text-pretty leading-relaxed">
            GradeMaster revolutionizes the assessment process with automated grading,
            instant feedback, and comprehensive analytics for students and educators.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to={setupRequired ? "/setup" : "/signup"}>
              <Button size="lg" className="gap-2">
                {setupRequired ? 'Setup Admin' : 'Start Free Trial'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="lg">Login</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="glass-card p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1" style={{ cursor: 'default' }}>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 micro-depth">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">AI Evaluation</h3>
            <p className="text-text-secondary">
              Automated code analysis with bug detection, plagiarism checking, and intelligent feedback.
            </p>
          </div>
          <div className="glass-card p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1" style={{ cursor: 'default' }}>
            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-4 micro-depth">
              <Shield className="w-6 h-6 text-success" />
            </div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Secure Sandbox</h3>
            <p className="text-text-secondary">
              Code runs in isolated containers with Judge0 for safe, reliable execution across languages.
            </p>
          </div>
          <div className="glass-card p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1" style={{ cursor: 'default' }}>
            <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center mb-4 micro-depth">
              <Zap className="w-6 h-6 text-warning" />
            </div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Instant Results</h3>
            <p className="text-text-secondary">
              Real-time test case execution, detailed feedback, and comprehensive analytics for improvement.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
