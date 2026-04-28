import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, TrendingUp, Award, Target, BarChart3,
  CheckCircle, XCircle, AlertTriangle, Lightbulb, Code, PenLine,
  FileQuestion, Trophy, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { analyticsAPI } from '../../lib/api'
import Card, { CardHeader, CardTitle, CardContent } from '../../components/Card'
import Button from '../../components/Button'
import Badge from '../../components/Badge'
import Loader from '../../components/Loader'

function StatCard({ icon: Icon, label, value, color, subtext }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        <div>
          <p className="text-sm text-text-secondary">{label}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          {subtext && <p className="text-xs text-text-secondary mt-0.5">{subtext}</p>}
        </div>
      </div>
    </Card>
  )
}

function ScoreBar({ percentage, height = 'h-3' }) {
  const color = percentage >= 80 ? 'bg-emerald-500' :
                percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className={`w-full ${height} bg-background rounded-full overflow-hidden`}>
      <div className={`${height} ${color} rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(percentage, 100)}%` }} />
    </div>
  )
}

export default function AssessmentReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [expandedQuestions, setExpandedQuestions] = useState({})

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const data = await analyticsAPI.getAssessmentReport(token, id)
        setReport(data)
      } catch (err) {
        console.error('Failed to fetch report:', err)
        setError(err.message || 'Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [id, token])

  const toggleQuestion = (qid) => {
    setExpandedQuestions(prev => ({ ...prev, [qid]: !prev[qid] }))
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const data = await analyticsAPI.regenerateAssessmentReport(token, id)
      setReport(data)
      addToast('Report regenerated successfully', 'success')
    } catch (err) {
      addToast(err.message || 'Failed to regenerate report', 'error')
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader size="lg" />
    </div>
  )

  if (error) return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>
      <Card>
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Report Not Available</h3>
          <p className="text-text-secondary">{error}</p>
        </div>
      </Card>
    </div>
  )

  const { common, mcq_insights, coding_insights, manual_insights } = report
  const aType = report.assessment_type

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-primary" />
            {report.assessment_title}
          </h1>
          <p className="text-text-secondary mt-1 flex items-center gap-2">
            Assessment Report
            <Badge variant="default">
              {aType === 'mcq' ? 'MCQ' : aType === 'coding' ? 'Coding' : aType === 'manual' ? 'Handwritten' : 'Mixed'}
            </Badge>
            {report.generated_at && (
              <span className="text-xs text-text-secondary ml-2">
                Generated {new Date(report.generated_at).toLocaleDateString()} {new Date(report.generated_at).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        {/* Regenerate button — not needed for MCQ-only (auto-evaluated) */}
        {aType !== 'mcq' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRegenerate}
            loading={regenerating}
            title="Re-compute report with latest submission data"
          >
            <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
            Regenerate
          </Button>
        )}
      </div>

      {/* Warning: unfinalized submissions — only relevant for non-MCQ types */}
      {aType !== 'mcq' && common.total_all_submissions > common.finalized_count && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
          <p className="text-sm text-text-primary">
            <strong>{common.total_all_submissions - common.finalized_count} submission(s)</strong> not yet reviewed/finalized. 
            This report only includes <strong>{common.finalized_count} finalized</strong> submission(s). 
            Review remaining submissions and click <strong>Regenerate</strong> to update the report.
          </p>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Reviewed"
          value={`${common.finalized_count}/${common.total_all_submissions || common.total_eligible}`}
          color="#6366f1"
          subtext={common.total_all_submissions > common.finalized_count 
            ? `${common.total_all_submissions - common.finalized_count} pending review` 
            : `All submissions reviewed`}
        />
        <StatCard
          icon={TrendingUp} label="Average Score"
          value={`${common.average_score}%`}
          color="#06b6d4"
          subtext={`Median: ${common.median_score}%`}
        />
        <StatCard
          icon={Award} label="Pass Rate"
          value={`${common.pass_rate}%`}
          color="#22c55e"
          subtext={`≥50% threshold`}
        />
        <StatCard
          icon={Target} label="Score Range"
          value={`${common.lowest_score}-${common.highest_score}%`}
          color="#f59e0b"
        />
      </div>

      {/* Score Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(common.score_distribution || {}).map(([range, count]) => {
              const total = common.total_submissions || 1
              const pct = Math.round(count / total * 100)
              return (
                <div key={range} className="flex items-center gap-4">
                  <span className="text-sm text-text-secondary w-16 shrink-0">{range}%</span>
                  <div className="flex-1">
                    <ScoreBar percentage={pct} />
                  </div>
                  <span className="text-sm font-medium text-text-primary w-20 text-right">
                    {count} student{count !== 1 ? 's' : ''} ({pct}%)
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top & Bottom Performers */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {common.top_performers?.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-background rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-500/20 text-amber-400' :
                      i === 1 ? 'bg-slate-400/20 text-slate-300' :
                      i === 2 ? 'bg-orange-600/20 text-orange-400' :
                      'bg-surface-light text-text-secondary'
                    }`}>{i + 1}</span>
                    <span className="text-sm font-medium text-text-primary">{p.name}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400">{p.score}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bottom Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Need Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {common.bottom_performers?.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-background rounded-xl">
                  <span className="text-sm font-medium text-text-primary">{p.name}</span>
                  <span className={`text-sm font-bold ${p.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {p.score}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── MCQ Insights ─── */}
      {mcq_insights && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <FileQuestion className="w-5 h-5 text-primary" />
            MCQ Analysis
          </h2>

          {/* Teaching Recommendation */}
          <Card className="border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary mb-1">AI Teaching Recommendation</p>
                <p className="text-sm text-text-primary leading-relaxed">
                  {mcq_insights.teaching_recommendation}
                </p>
              </div>
            </div>
          </Card>

          {/* Question Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Question-by-Question Analysis</CardTitle>
              <p className="text-sm text-text-secondary">Sorted by error rate (most missed first)</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mcq_insights.question_analysis?.map((q, i) => (
                  <div key={q.question_id || i}
                    className="border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleQuestion(q.question_id || i)}
                      className="w-full flex items-center justify-between p-4 hover:bg-background/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                          q.error_rate > 50 ? 'bg-red-500/10 text-red-400' :
                          q.error_rate > 25 ? 'bg-amber-500/10 text-amber-400' :
                          'bg-emerald-500/10 text-emerald-400'
                        }`}>Q{i + 1}</span>
                        <p className="text-sm text-text-primary text-left truncate">
                          {q.question_text}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className={`text-sm font-bold ${
                          q.correct_pct >= 75 ? 'text-emerald-400' :
                          q.correct_pct >= 50 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {q.correct_pct}% correct
                        </span>
                        {expandedQuestions[q.question_id || i]
                          ? <ChevronUp className="w-4 h-4 text-text-secondary" />
                          : <ChevronDown className="w-4 h-4 text-text-secondary" />
                        }
                      </div>
                    </button>

                    {expandedQuestions[q.question_id || i] && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-2 bg-background rounded-lg">
                            <p className="text-lg font-bold text-text-primary">{q.total_attempts}</p>
                            <p className="text-xs text-text-secondary">Attempts</p>
                          </div>
                          <div className="text-center p-2 bg-background rounded-lg">
                            <p className="text-lg font-bold text-emerald-400">{q.correct_count}</p>
                            <p className="text-xs text-text-secondary">Correct</p>
                          </div>
                          <div className="text-center p-2 bg-background rounded-lg">
                            <p className="text-lg font-bold text-red-400">{q.total_attempts - q.correct_count}</p>
                            <p className="text-xs text-text-secondary">Wrong</p>
                          </div>
                        </div>
                        {q.most_wrong_option && (
                          <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                            <p className="text-xs text-red-400 font-medium">Most Common Wrong Answer</p>
                            <p className="text-sm text-text-primary mt-1">
                              Option "{q.most_wrong_option}" — chosen by {q.most_wrong_count} student{q.most_wrong_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        )}
                        {/* Option Distribution */}
                        {q.option_distribution && (
                          <div>
                            <p className="text-xs text-text-secondary mb-2 uppercase tracking-wider">Response Distribution</p>
                            <div className="space-y-1.5">
                              {Object.entries(q.option_distribution).map(([opt, count]) => {
                                const pct = Math.round(count / q.total_attempts * 100)
                                const isCorrect = opt === q.correct_answer
                                return (
                                  <div key={opt} className="flex items-center gap-3">
                                    <span className={`text-xs font-bold w-6 ${isCorrect ? 'text-emerald-400' : 'text-text-secondary'}`}>
                                      {opt}
                                    </span>
                                    <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                                      <div className={`h-2 rounded-full ${isCorrect ? 'bg-emerald-500' : 'bg-slate-600'}`}
                                        style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs text-text-secondary w-12 text-right">{count} ({pct}%)</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Coding Insights ─── */}
      {coding_insights && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Code className="w-5 h-5 text-primary" />
            Coding Analysis
          </h2>

          {/* Teaching Recommendation */}
          <Card className="border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary mb-1">AI Teaching Recommendation</p>
                <p className="text-sm text-text-primary leading-relaxed">
                  {coding_insights.teaching_recommendation}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Test Pass Rate */}
            <Card>
              <CardHeader>
                <CardTitle>Test Pass Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className={`text-5xl font-bold ${
                    coding_insights.avg_test_pass_rate >= 80 ? 'text-emerald-400' :
                    coding_insights.avg_test_pass_rate >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>{coding_insights.avg_test_pass_rate}%</p>
                  <p className="text-sm text-text-secondary mt-2">Average across all submissions</p>
                </div>
              </CardContent>
            </Card>

            {/* Language Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Language Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(coding_insights.language_distribution || {}).map(([lang, count]) => (
                    <div key={lang} className="flex items-center justify-between p-3 bg-background rounded-xl">
                      <span className="text-sm font-medium text-text-primary capitalize">{lang}</span>
                      <Badge variant="default">{count} submission{count !== 1 ? 's' : ''}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Common Issues */}
          {coding_insights.common_issues?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Common Issues</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {coding_insights.common_issues.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-background rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-text-primary">{item.issue}</p>
                      </div>
                      <Badge variant="warning">{item.count}×</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Manual Insights ─── */}
      {manual_insights && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <PenLine className="w-5 h-5 text-primary" />
            Handwritten Assignment Analysis
          </h2>

          {/* Teaching Recommendation */}
          <Card className="border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary mb-1">AI Teaching Recommendation</p>
                <p className="text-sm text-text-primary leading-relaxed">
                  {manual_insights.teaching_recommendation}
                </p>
              </div>
            </div>
          </Card>

          {/* Per-Question Average Scores */}
          <Card>
            <CardHeader>
              <CardTitle>Per-Question Performance</CardTitle>
              <p className="text-sm text-text-secondary">Sorted by weakest first</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {manual_insights.per_question_avg?.map((q, i) => (
                  <div key={q.question_id || i} className="p-3 bg-background rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        q.average_percentage >= 75 ? 'bg-emerald-500/10 text-emerald-400' :
                        q.average_percentage >= 50 ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>{q.question_id}</span>
                      <p className="text-sm font-medium text-text-primary flex-1">{q.question_text}</p>
                      <span className={`text-sm font-bold shrink-0 ${
                        q.average_percentage >= 75 ? 'text-emerald-400' :
                        q.average_percentage >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>{q.average_score}/{q.max_marks} avg</span>
                    </div>
                    <ScoreBar percentage={q.average_percentage} height="h-2" />
                    <p className="text-xs text-text-secondary mt-1">{q.average_percentage}% average</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Keywords Missed Per Question */}
            {manual_insights.keywords_by_question?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Missed Keywords by Question</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {manual_insights.keywords_by_question.map((kq, i) => (
                      <div key={kq.question_id || i}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/10 text-red-400">
                            {kq.question_id}
                          </span>
                          <p className="text-xs text-text-secondary truncate">{kq.question_text}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {kq.missed_keywords.map((k, j) => (
                            <span key={j} className="px-2.5 py-1 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/20">
                              ✗ {k.keyword} <span className="opacity-70">({k.count}×)</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Correctness Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Quality Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(manual_insights.correctness_distribution || {}).map(([level, count]) => (
                    <div key={level} className="flex items-center justify-between p-3 bg-background rounded-xl">
                      <span className={`text-sm font-medium capitalize ${
                        level === 'good' ? 'text-emerald-400' :
                        level === 'partial' ? 'text-amber-400' : 'text-red-400'
                      }`}>{level}</span>
                      <Badge variant={level === 'good' ? 'success' : level === 'partial' ? 'warning' : 'error'}>
                        {count} response{count !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
