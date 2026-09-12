import React, { useState, Children, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Adapted from reactbits.dev's Stepper. Two real changes from their source:
// 1. Imports from 'framer-motion' (already in this project) instead of
//    'motion/react' (a different, newer package name -- no need to add it).
// 2. Every rounded/hardcoded-purple default (pill buttons, circular step
//    indicators, #5227ff) is replaced with hard-edged shapes and CSS
//    variables, per DESIGN.md's border-radius:0 and "no hardcoded hex"
//    rules. The interaction/motion logic itself is untouched.

export default function StoryStepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  backButtonText = 'Back',
  nextButtonText = 'Next',
}) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [direction, setDirection] = useState(0)
  const stepsArray = Children.toArray(children)
  const totalSteps = stepsArray.length
  const isLastStep = currentStep === totalSteps

  const updateStep = (newStep) => {
    setCurrentStep(newStep)
    onStepChange(newStep)
  }
  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1)
      updateStep(currentStep - 1)
    }
  }
  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1)
      updateStep(currentStep + 1)
    }
  }

  return (
    <div className="story-stepper">
      <div className="story-stepper-indicator-row">
        {stepsArray.map((_, index) => {
          const stepNumber = index + 1
          return (
            <React.Fragment key={stepNumber}>
              <StepIndicator
                step={stepNumber}
                currentStep={currentStep}
                onClickStep={(clicked) => {
                  setDirection(clicked > currentStep ? 1 : -1)
                  updateStep(clicked)
                }}
              />
              {index < totalSteps - 1 && <StepConnector isComplete={currentStep > stepNumber} />}
            </React.Fragment>
          )
        })}
      </div>

      <div className="story-stepper-content">
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {stepsArray[currentStep - 1]}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="story-stepper-footer">
        <button
          onClick={handleBack}
          className="btn-mini"
          disabled={currentStep === 1}
          style={{ visibility: currentStep === 1 ? 'hidden' : 'visible' }}
        >
          {backButtonText}
        </button>
        <span className="story-stepper-count">{currentStep} / {totalSteps}</span>
        <button onClick={handleNext} className="btn-mini accent" disabled={isLastStep} style={{ opacity: isLastStep ? 0.4 : 1 }}>
          {nextButtonText}
        </button>
      </div>
    </div>
  )
}

const stepVariants = {
  enter: (dir) => ({ x: dir >= 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir >= 0 ? -40 : 40, opacity: 0 }),
}

export function Step({ children }) {
  return <div className="story-step">{children}</div>
}

function StepIndicator({ step, currentStep, onClickStep }) {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete'
  return (
    <button
      type="button"
      className={`story-step-dot ${status}`}
      onClick={() => step !== currentStep && onClickStep(step)}
      aria-label={`Go to step ${step}`}
      aria-current={status === 'active'}
    >
      {step}
    </button>
  )
}

function StepConnector({ isComplete }) {
  return (
    <div className="story-step-connector">
      <motion.div
        className="story-step-connector-fill"
        initial={false}
        animate={{ width: isComplete ? '100%' : '0%' }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}
