import { useEffect, useState, useMemo } from 'react'
import { Users, FileText, TrendingUp, Award, Download, BarChart3 } from 'lucide-react'
import { useApp } from '../../lib/context/AppContext'
import { analyticsAPI, teacherAPI } from '../../lib/api'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import createPlotlyComponent from 'react-plotly.js/factory.js'
import Plotly from 'plotly.js-basic-dist-min'

const Plot = (typeof createPlotlyComponent === 'function' ? createPlotlyComponent : createPlotlyComponent.default)(Plotly)

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center`}
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

function PlotlyChart({ chartJson, height = 320 }) {
  const parsed = useMemo(() => {
    if (!chartJson || chartJson === '{}') return null
    try {
      return JSON.parse(chartJson)
    } catch {
      return null
    }
  }, [chartJson])

  if (!parsed || !parsed.data) {
    return (
      <div className="flex items-center justify-center h-[200px] text-text-secondary text-sm">
        No data available
      </div>
    )
  }

  return (
    <Plot
      data={parsed.data}
      layout={{
        ...parsed.layout,
        autosize: true,
        height: height,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8', size: 11 },
        xaxis: { ...parsed.layout?.xaxis, gridcolor: '#1e293b', zerolinecolor: '#1e293b' },
        yaxis: { ...parsed.layout?.yaxis, gridcolor: '#1e293b', zerolinecolor: '#1e293b' },
        margin: { t: 40, b: 50, l: 50, r: 20 },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
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

function SkeletonChart() {
  return (
    <Card>
      <div className="animate-pulse">
        <div className="h-5 bg-background rounded w-40 mb-4" />
        <div className="h-[280px] bg-background rounded-xl" />
      </div>
    </Card>
  )
}

export default function TeacherAnalytics() {
  const { token, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [assessments, setAssessments] = useState([])
  const [selectedAssessment, setSelectedAssessment] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [analyticsData, assessmentList] = await Promise.all([
          analyticsAPI.getTeacherDashboard(token),
          teacherAPI.getAssessments(token).catch(() => []),
        ])
        setData(analyticsData)
        const list = Array.isArray(assessmentList) ? assessmentList : assessmentList?.assessments || []
        setAssessments(list)
        if (list.length > 0) {
          setSelectedAssessment(list[0].id || list[0]._id || '')
        }
      } catch (error) {
        console.error('Failed to load analytics:', error)
        addToast('Failed to load analytics data', 'error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [token, addToast])

  const handleDownloadReport = async () => {
    if (!selectedAssessment) {
      addToast('Select an assessment first', 'warning')
      return
    }
    setDownloading(true)
    try {
      await analyticsAPI.downloadAssessmentReport(token, selectedAssessment)
      addToast('Report downloaded!', 'success')
    } catch (error) {
      addToast('Failed to download report', 'error')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Analytics Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <SkeletonChart /><SkeletonChart />
        </div>
        <SkeletonChart />
      </div>
    )
  }

  const stats = data?.stats || {}
  const charts = data?.charts || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-primary" />
            Analytics Dashboard
          </h1>
          <p className="text-text-secondary mt-1">Overview of your class performance</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Students" value={stats.total_students || 0} color="#6366f1" />
        <StatCard icon={FileText} label="Total Submissions" value={stats.total_submissions || 0} color="#8b5cf6" />
        <StatCard icon={TrendingUp} label="Average Score" value={`${stats.average_score || 0}%`} color="#06b6d4" />
        <StatCard icon={Award} label="Pass Rate" value={`${stats.pass_percentage || 0}%`} color="#22c55e" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Average Score per Assessment</h2>
          <PlotlyChart chartJson={charts.score_distribution} />
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Pass vs Fail Distribution</h2>
          <PlotlyChart chartJson={charts.pass_fail} />
        </Card>
      </div>

      {/* Chart Row 2 */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-2">Submission Trend</h2>
        <PlotlyChart chartJson={charts.submission_trend} height={300} />
      </Card>

      {/* Download Report */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Download Class Report</h2>
        <div className="flex items-center gap-4">
          <select
            className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={selectedAssessment}
            onChange={(e) => setSelectedAssessment(e.target.value)}
          >
            <option value="">Select Assessment</option>
            {assessments.map((a) => (
              <option key={a.id || a._id} value={a.id || a._id}>
                {a.title}
              </option>
            ))}
          </select>
          <Button onClick={handleDownloadReport} loading={downloading} disabled={!selectedAssessment}>
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        </div>
      </Card>
    </div>
  )
}
