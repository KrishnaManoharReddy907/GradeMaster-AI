import { CheckCircle, XCircle, Bot, User } from 'lucide-react'
import Card from './Card'

export default function ResultCard({
  aiScore,
  finalScore,
  passed,
  total,
  accuracyScore,
  status,
}) {
  const isPassed = passed || (finalScore && finalScore >= (total ? total / 2 : 50))

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className={`-mx-6 -mt-6 px-6 py-4 mb-6 ${isPassed ? 'bg-success/10' : 'bg-error/10'}`}>
        <div className="flex items-center gap-3">
          {isPassed ? (
            <CheckCircle className="w-8 h-8 text-success" />
          ) : (
            <XCircle className="w-8 h-8 text-error" />
          )}
          <div>
            <h3 className={`text-lg font-semibold ${isPassed ? 'text-success' : 'text-error'}`}>
              {isPassed ? 'Passed' : 'Not Passed'}
            </h3>
            {status && (
              <p className="text-sm text-text-secondary capitalize">{status}</p>
            )}
          </div>
        </div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-4">
        {/* AI Score */}
        <div className="p-4 bg-background rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-sm text-text-secondary">AI Score</span>
          </div>
          <p className="text-2xl font-bold text-primary">
            {aiScore !== undefined ? aiScore : '-'}
            {total && <span className="text-sm text-text-secondary font-normal">/{total}</span>}
          </p>
        </div>

        {/* Final Score */}
        <div className="p-4 bg-background rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-success" />
            <span className="text-sm text-text-secondary">Final Score</span>
          </div>
          <p className="text-2xl font-bold text-success">
            {finalScore !== undefined ? finalScore : '-'}
            {total && <span className="text-sm text-text-secondary font-normal">/{total}</span>}
          </p>
        </div>
      </div>

      {/* Accuracy Score */}
      {accuracyScore !== undefined && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Accuracy Score</span>
            <span className="font-medium text-text-primary">{Math.round(accuracyScore)}%</span>
          </div>
          <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(accuracyScore, 100)}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  )
}
