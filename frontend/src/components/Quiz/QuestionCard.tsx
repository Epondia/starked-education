import React from 'react';

export interface Question {
  id: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer' | 'essay' | 'fill-in-the-blank' | 'code-submission' | 'drag-and-drop' | 'image-based';
  question: string;
  options?: string[] | any[];
  imageUrl?: string;
  codeTemplate?: string;
  dropZones?: any[];
}

interface QuestionCardProps {
  question: Question;
  answer: any;
  onChange: (value: any) => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  answer,
  onChange,
}) => {
  const renderMCQ = () => {
    const options = (question.options || []) as (string | { id: string, text: string })[];
    return (
      /*
       * WCAG 1.3.1, 4.1.2 — Use role="radiogroup" so assistive technologies
       * understand that these buttons form a mutually-exclusive choice group.
       * Each option uses role="radio" + aria-checked rather than a plain button.
       */
      <div
        role="radiogroup"
        aria-labelledby={`question-label-${question.id}`}
        className="space-y-3"
      >
        {options.map((option, index) => {
          const optionText = typeof option === 'string' ? option : option.text;
          const optionId = typeof option === 'string' ? index : option.id;
          const isSelected = answer === optionId;
          
          return (
            <button
              key={index}
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(optionId)}
              className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="flex items-center">
                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center mr-3 flex-shrink-0 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-gray-400 text-gray-400'
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                <span>{optionText}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderEssay = () => (
    <textarea
      value={answer || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write your answer here..."
      aria-label={`Answer to: ${question.question}`}
      className="w-full min-h-[200px] p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
    />
  );

  const renderCode = () => (
    <div className="space-y-4">
      <div className="p-3 bg-gray-100 dark:bg-gray-900 rounded-md text-sm font-mono text-gray-600 dark:text-gray-400" aria-hidden="true">
        // Write your code solution here
      </div>
      <textarea
        value={answer || question.codeTemplate || ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Code answer to: ${question.question}`}
        className="w-full min-h-[300px] p-4 rounded-lg bg-gray-950 text-emerald-400 font-mono text-sm border-none focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        spellCheck="false"
      />
    </div>
  );

  const renderImage = () => (
    <div className="space-y-4">
      {question.imageUrl && (
        <div className="mb-4 overflow-hidden rounded-lg">
          {/* Descriptive alt is required; fall back to question text if no dedicated alt */}
          <img
            src={question.imageUrl}
            alt={`Image for question: ${question.question}`}
            className="max-w-full h-auto object-cover hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}
      {renderMCQ()}
    </div>
  );

  const renderContent = () => {
    switch (question.type) {
      case 'multiple-choice':
      case 'true-false':
        return renderMCQ();
      case 'essay':
      case 'short-answer':
      case 'fill-in-the-blank':
        return renderEssay();
      case 'code-submission':
        return renderCode();
      case 'image-based':
        return renderImage();
      default:
        return (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-400 rounded-lg">
            This question type ({question.type}) is currently requiring a specialized interface.
          </div>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800">
      <div className="mb-6">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider" aria-hidden="true">
          {question.type.replace('-', ' ')}
        </span>
        {/*
         * id matches `aria-labelledby` on the radiogroup above.
         * h3 is appropriate here — QuizPlayer already renders an h2 for Progress.
         */}
        <h3
          id={`question-label-${question.id}`}
          className="text-xl font-bold text-gray-900 dark:text-white leading-tight"
        >
          {question.question}
        </h3>
      </div>
      {renderContent()}
    </div>
  );
};

export default QuestionCard;