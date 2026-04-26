import { useEffect, useState, useMemo } from 'react'
import { FileText, TrendingUp, Trophy, Download, BarChart3, Clock, CheckCircle, Filter } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { analyticsAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Badge from '../../components/Badge'
import Loader from '../../components/Loader'
import createPlotlyComponent from 'react-plotly.js/factory.js'
import Plotly from 'plotly.js-basic-dist-min'

const Plot = (typeof createPlotlyComponent === 'function' ? createPlotlyComponent : createPlotlyComponent.default)(Plotly)

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899']

const chartLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { color: '#e2e8f0', size: 12 },
  xaxis: {
    gridcolor: 'rgba(148,163,184,0.1)',
    zerolinecolor: 'rgba(148,163,184,0.2)',
    tickfont: { color: '#94a3b8', size: 11 },
    title: { font: { color: '#cbd5e1', size: 13 } },
  },
  yaxis: {
    gridcolor: 'rgba(148,163,184,0.1)',
    zerolinecolor: 'rgba(148,163,184,0.2)',
    tickfont: { color: '#94a3b8', size: 11 },
    title: { font: { color: '#cbd5e1', size: 13 } },
  },
}

function StatCard({ icon: Icon, label, value, color }) {
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
        </div>
      </div>
    </Card>
  )
}

function SkeletonCard() {
  return (
    <Card>
      <div className="animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-background" />
          <div className="space-y-2 flex-1">
            <div className="h-3 bg-background rounded w-20" />
            <div className="h-6 bg-background rounded w-16" />
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function StudentAnalytics() {
  const { token, user, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('all')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const analyticsData = await analyticsAPI.getStudentDashboard(token)
        setData(analyticsData)
      } catch (error) {
        console.error('Failed to load analytics:', error)
        addToast('Failed to load analytics data', 'error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [token, addToast])

  const handleDownload = async () => {
    if (!user?.id) return
    setDownloading(true)
    try {
      await analyticsAPI.downloadStudentReport(token, user.id)
      addToast('Report downloaded!', 'success')
    } catch (error) {
      addToast('Failed to download report', 'error')
    } finally {
      setDownloading(false)
    }
  }

  // Filter submissions by selected subject
  const filteredSubs = useMemo(() => {
    const all = data?.all_submissions || []
    if (selectedSubject === 'all') return all
    return all.filter(s => s.subject === selectedSubject)
  }, [data, selectedSubject])

  // Build Score Trend chart data
  const scoreTrendData = useMemo(() => {
    if (!filteredSubs.length) return null

    return {
      data: [{
        x: filteredSubs.map(s => s.title),
        y: filteredSubs.map(s => s.percentage),
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#6366f1', width: 3, shape: 'spline' },
        marker: { size: 10, color: '#6366f1', line: { width: 2, color: '#1e293b' } },
        text: filteredSubs.map(s => `${s.title}<br>${s.date}<br>Score: ${s.score}/${s.max_marks}`),
        hovertemplate: '%{text}<br><b>%{y}%</b><extra></extra>',
        fill: 'tozeroy',
        fillcolor: 'rgba(99,102,241,0.08)',
      }],
      layout: {
        ...chartLayout,
        height: 340,
        autosize: true,
        xaxis: {
          ...chartLayout.xaxis,
          title: { text: 'Assessment', font: { color: '#cbd5e1', size: 13 } },
          tickangle: filteredSubs.length > 4 ? -25 : 0,
          tickfont: { color: '#94a3b8', size: 10 },
        },
        yaxis: {
          ...chartLayout.yaxis,
          title: { text: 'Score (%)', font: { color: '#cbd5e1', size: 13 } },
          range: [0, 110],
        },
        margin: { t: 20, b: filteredSubs.length > 4 ? 100 : 60, l: 55, r: 20 },
      },
    }
  }, [filteredSubs])

  // Build Subject Performance chart data
  const subjectChartData = useMemo(() => {
    const avgs = data?.subject_averages || {}
    const entries = Object.entries(avgs).sort((a, b) => a[1] - b[1])
    if (!entries.length) return null

    return {
      data: [{
        x: entries.map(([, v]) => v),
        y: entries.map(([k]) => k),
        type: 'bar',
        orientation: 'h',
        marker: {
          color: entries.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        },
        text: entries.map(([, v]) => `${v}%`),
        textposition: 'auto',
        textfont: { color: '#fff', size: 13, weight: 600 },
        hovertemplate: '<b>%{y}</b><br>Average: %{x}%<extra></extra>',
      }],
      layout: {
        ...chartLayout,
        height: Math.max(220, entries.length * 60 + 80),
        autosize: true,
        xaxis: {
          ...chartLayout.xaxis,
          title: { text: 'Average Score (%)', font: { color: '#cbd5e1', size: 13 } },
          range: [0, 110],
        },
        yaxis: {
          ...chartLayout.yaxis,
          title: { text: '' },
          tickfont: { color: '#e2e8f0', size: 13 },
          automargin: true,
        },
        margin: { t: 20, b: 50, l: 10, r: 20 },
      },
    }
  }, [data])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">My Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card><div className="animate-pulse h-[300px] bg-background rounded-xl" /></Card>
          <Card><div className="animate-pulse h-[300px] bg-background rounded-xl" /></Card>
        </div>
      </div>
    )
  }

  const stats = data?.stats || {}
  const subjects = data?.subjects || []
  const recent = data?.recent_submissions || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-primary" />
            My Analytics
          </h1>
          <p className="text-text-secondary mt-1">Track your performance across assessments</p>
        </div>
        <Button onClick={handleDownload} loading={downloading}>
          <Download className="w-4 h-4" />
          Download Report
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total Submissions" value={stats.total_submissions || 0} color="#6366f1" />
        <StatCard icon={TrendingUp} label="Average Score" value={`${stats.average_score || 0}%`} color="#06b6d4" />
        <StatCard icon={Trophy} label="Best Score" value={`${stats.best_score || 0}%`} color="#22c55e" />
        <StatCard icon={CheckCircle} label="Pass Rate" value={`${stats.pass_rate || 0}%`} color="#8b5cf6" />
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Score Trend — wider (3/5) */}
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-text-primary">Score Trend</h2>
            {/* Subject Filter */}
            {subjects.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-text-secondary" />
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="all">All Subjects</option>
                  {subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-text-secondary mb-2">
            {selectedSubject === 'all' ? 'All assessments' : `Filtered: ${selectedSubject}`}
            {' · '}{filteredSubs.length} submission{filteredSubs.length !== 1 ? 's' : ''}
          </p>
          {scoreTrendData ? (
            <Plot
              data={scoreTrendData.data}
              layout={scoreTrendData.layout}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
              useResizeHandler
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[280px] text-text-secondary">
              <FileText className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No submissions yet</p>
              <p className="text-xs mt-1">Complete assessments to see your score trend</p>
            </div>
          )}
        </Card>

        {/* Subject Performance — narrower (2/5) */}
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-text-primary mb-3">Subject Performance</h2>
          <p className="text-xs text-text-secondary mb-2">Average score per subject</p>
          {subjectChartData ? (
            <Plot
              data={subjectChartData.data}
              layout={subjectChartData.layout}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
              useResizeHandler
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[220px] text-text-secondary">
              <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No data yet</p>
            </div>
          )}
        </Card>
      </div>

      {/* Recent Submissions Table */}
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
          <Clock className="w-5 h-5 text-primary" />
          Recent Submissions
        </h2>
        {recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-3 px-4 text-text-secondary font-medium">Assessment</th>
                  <th className="py-3 px-4 text-text-secondary font-medium">Subject</th>
                  <th className="py-3 px-4 text-text-secondary font-medium">Type</th>
                  <th className="py-3 px-4 text-text-secondary font-medium text-center">Score</th>
                  <th className="py-3 px-4 text-text-secondary font-medium text-center">%</th>
                  <th className="py-3 px-4 text-text-secondary font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((sub, index) => (
                  <tr key={index} className="border-b border-border/50 hover:bg-background/50 transition-colors">
                    <td className="py-3 px-4 text-text-primary font-medium">{sub.assessment_title}</td>
                    <td className="py-3 px-4 text-text-secondary text-sm">{sub.subject || '-'}</td>
                    <td className="py-3 px-4">
                      <Badge variant={sub.type === 'coding' ? 'primary' : sub.type === 'manual' ? 'warning' : 'default'}>
                        {sub.type === 'coding' ? 'Coding' : sub.type === 'manual' ? 'Handwritten' : 'MCQ'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center text-text-primary">{sub.score}/{sub.max_marks}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-semibold ${sub.percentage >= 50 ? 'text-success' : 'text-error'}`}>
                        {Math.round(sub.percentage)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={
                        sub.status === 'finalized' ? 'success' :
                        sub.status === 'evaluated' || sub.status === 'reviewed' ? 'primary' : 'warning'
                      }>
                        {sub.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-text-secondary mx-auto mb-4 opacity-50" />
            <p className="text-text-secondary">No submissions yet</p>
            <p className="text-text-secondary text-sm mt-1">Complete some assessments to see your analytics</p>
          </div>
        )}
      </Card>
    </div>
  )
}
