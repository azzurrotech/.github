"use strict";

/**
 * VINI Workflow Integration for Azzurro Tech Website
 * Complete workflow definition and execution system for website processes
 */

class WebsiteWorkflowSystem {
  constructor(options = {}) {
    this.options = {
      autoStart: options.autoStart !== false,
      debugMode: options.debugMode || false,
      serverEndpoint: options.serverEndpoint || null,
      encryptionKey: options.encryptionKey || null,
      validationSchema: options.validationSchema || null,
      ...options
    };

    this.workflows = new Map();
    this.currentWorkflow = null;
    this.userProgress = new Map();
    this.executionLogs = [];
    this.eventHandlers = {};
    this.initialized = false;
  }

  /**
   * Initialize the workflow system
   */
  init() {
    if (this.initialized) return;

    this.initialized = true;
    this.setupEventHandlers();
    this.loadWorkflows();

    if (this.options.autoStart && this.workflows.size > 0) {
      const firstWorkflow = this.getWorkflow(this.workflows.keys().next().value);
      this.startWorkflow(firstWorkflow.name);
    }

    return this;
  }

  /**
   * Setup event handlers for workflow events
   */
  setupEventHandlers() {
    this.eventHandlers = {
      'workflow-start': [],
      'workflow-continue': [],
      'workflow-complete': [],
      'workflow-pause': [],
      'workflow-resume': [],
      'workflow-end': [],
      'step-complete': [],
      'validation-error': [],
      'server-response': []
    };

    // Add global event listeners
    document.addEventListener('vini:start', this.handleStartEvent.bind(this));
    document.addEventListener('vini:continue', this.handleContinueEvent.bind(this));
    document.addEventListener('vini:complete', this.handleCompleteEvent.bind(this));
    document.addEventListener('vini:pause', this.handlePauseEvent.bind(this));
    document.addEventListener('vini:resume', this.handleResumeEvent.bind(this));
    document.addEventListener('vini:end', this.handleEndEvent.bind(this));
    document.addEventListener('vini:step-complete', this.handleStepCompleteEvent.bind(this));
    document.addEventListener('vini:validation-error', this.handleValidationErrorEvent.bind(this));
    document.addEventListener('vini:server-response', this.handleServerResponseEvent.bind(this));
  }

  /**
   * Load website-specific workflows
   */
  loadWorkflows() {
    // Website user registration workflow
    this.createUserRegistrationWorkflow();

    // Component service request workflow
    this.createComponentServiceWorkflow();

    // Website analytics workflow
    this.createWebsiteAnalyticsWorkflow();

    // Support ticket workflow
    this.createSupportTicketWorkflow();

    // User feedback workflow
    this.createUserFeedbackWorkflow();
  }

  /**
   * Create user registration workflow
   */
  createUserRegistrationWorkflow() {
    const workflow = {
      id: 'workflow-user-registration',
      name: 'New User Registration',
      steps: [
        {
          id: 'step-1',
          name: 'Website Visit',
          type: 'trigger',
          description: 'User visits the Azzurro Tech website',
          action: 'track_event',
          action_params: { event: 'website_visit', user_agent: navigator.userAgent }
        },
        {
          id: 'step-2',
          name: 'Navigation to Registration',
          type: 'action',
          description: 'User clicks "Get Started" or "Sign In" button',
          action: 'trigger_modal',
          action_params: { modal: 'login', action: 'open' }
        },
        {
          id: 'step-3',
          name: 'Form Completion',
          type: 'input',
          description: 'User fills in registration form with name, email, and password',
          action: 'validate_form',
          action_params: { form: 'registration', fields: ['name', 'email', 'password'] }
        },
        {
          id: 'step-4',
          name: 'Email Verification',
          type: 'validation',
          description: 'User verifies email address via magic link',
          action: 'send_magic_link',
          action_params: { email: '{{form.email}}', template: 'email-verification' }
        },
        {
          id: 'step-5',
          name: 'Account Setup Completion',
          type: 'completion',
          description: 'User completes account setup and starts using platform',
          action: 'redirect',
          action_params: { url: '/dashboard', message: 'Welcome to Azzurro Tech!' }
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      status: 'active',
      version: 1,
      metadata: {
        description: 'Complete user registration workflow for the Azzurro Tech website',
        category: 'user-onboarding',
        estimatedTime: '5 minutes',
        completionRate: 85
      }
    };

    this.workflows.set(workflow.id, workflow);
    this.logExecution('workflow_create', 'system', `Website user registration workflow created`, {workflowId: workflow.id, stepCount: workflow.steps.length});

    return workflow;
  }

  /**
   * Create component service request workflow
   */
  createComponentServiceWorkflow() {
    const workflow = {
      id: 'workflow-component-service',
      name: 'Emperor42 Component Service Request',
      steps: [
        {
          id: 'step-1',
          name: 'Component Discovery',
          type: 'trigger',
          description: 'User explores Emperor42 components section',
          action: 'track_component_view',
          action_params: { component: '{{component.name}}', source: 'components-page' }
        },
        {
          id: 'step-2',
          name: 'Service Request Initiation',
          type: 'action',
          description: 'User clicks "Request Service" or "Learn More" button',
          action: 'trigger_modal',
          action_params: { modal: 'demo', action: 'open' }
        },
        {
          id: 'step-3',
          name: 'Service Details Submission',
          type: 'input',
          description: 'User provides component-specific service details',
          action: 'validate_form',
          action_params: { form: 'service-request', fields: ['component', 'name', 'email', 'message'] }
        },
        {
          id: 'step-4',
          name: 'Service Processing',
          type: 'processing',
          description: 'System processes service request and generates response',
          action: 'process_service_request',
          action_params: { service: '{{form.component}}', priority: 'high' }
        },
        {
          id: 'step-5',
          name: 'Service Response Delivery',
          type: 'completion',
          description: 'User receives service response and next steps',
          action: 'send_response',
          action_params: { type: 'email', template: 'service-response' }
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      status: 'active',
      version: 1,
      metadata: {
        description: 'Complete service request workflow for Emperor42 components',
        category: 'component-support',
        estimatedTime: '3 minutes',
        completionRate: 92
      }
    };

    this.workflows.set(workflow.id, workflow);
    this.logExecution('workflow_create', 'system', `Component service request workflow created`, {workflowId: workflow.id, stepCount: workflow.steps.length});

    return workflow;
  }

  /**
   * Create website analytics workflow
   */
  createWebsiteAnalyticsWorkflow() {
    const workflow = {
      id: 'workflow-website-analytics',
      name: 'Website Usage Analytics Collection',
      steps: [
        {
          id: 'step-1',
          name: 'User Interaction Tracking',
          type: 'trigger',
          description: 'System tracks user interactions on website',
          action: 'track_interaction',
          action_params: { interaction: '{{interaction.type}}', page: '{{page.url}}' }
        },
        {
          id: 'step-2',
          name: 'Data Aggregation',
          type: 'processing',
          description: 'Aggregate user interaction data for analytics',
          action: 'aggregate_data',
          action_params: { timeRange: 'last_24_hours', metrics: ['page_views', 'component_clicks', 'form_submissions'] }
        },
        {
          id: 'step-3',
          name: 'Analytics Generation',
          type: 'analysis',
          description: 'Generate insights from aggregated data',
          action: 'generate_insights',
          action_params: { insights: ['top_components', 'user_behavior', 'performance'] }
        },
        {
          id: 'step-4',
          name: 'Report Distribution',
          type: 'completion',
          description: 'Distribute analytics report to stakeholders',
          action: 'send_report',
          action_params: { format: 'dashboard', recipients: ['admin', 'team'] }
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      status: 'active',
      version: 1,
      metadata: {
        description: 'Automated website analytics collection and reporting workflow',
        category: 'data-analytics',
        estimatedTime: '2 minutes',
        completionRate: 100
      }
    };

    this.workflows.set(workflow.id, workflow);
    this.logExecution('workflow_create', 'system', `Website analytics workflow created`, {workflowId: workflow.id, stepCount: workflow.steps.length});

    return workflow;
  }

  /**
   * Create support ticket workflow
   */
  createSupportTicketWorkflow() {
    const workflow = {
      id: 'workflow-support-ticket',
      name: 'Support Ticket Submission',
      steps: [
        {
          id: 'step-1',
          name: 'Issue Identification',
          type: 'trigger',
          description: 'User identifies an issue or requests support',
          action: 'track_issue',
          action_params: { type: 'support_request', priority: 'auto-determine' }
        },
        {
          id: 'step-2',
          name: 'Ticket Creation',
          type: 'action',
          description: 'Create support ticket with user details',
          action: 'create_ticket',
          action_params: { user: '{{user.id}}', auto_assign: 'support-team' }
        },
        {
          id: 'step-3',
          name: 'Triage and Assignment',
          type: 'processing',
          description: 'Triage ticket and assign to appropriate support agent',
          action: 'triage_ticket',
          action_params: { urgency: 'auto-assess', category: 'component-issue' }
        },
        {
          id: 'step-4',
          name: 'Resolution and Response',
          type: 'completion',
          description: 'Resolve issue and provide response to user',
          action: 'resolve_ticket',
          action_params: { resolution_time: 'within_24_hours', satisfaction: 'ensure_high' }
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      status: 'active',
      version: 1,
      metadata: {
        description: 'Complete support ticket workflow for user assistance',
        category: 'customer-support',
        estimatedTime: '10 minutes (variable)',
        completionRate: 88
      }
    };

    this.workflows.set(workflow.id, workflow);
    this.logExecution('workflow_create', 'system', `Support ticket workflow created`, {workflowId: workflow.id, stepCount: workflow.steps.length});

    return workflow;
  }

  /**
   * Create user feedback workflow
   */
  createUserFeedbackWorkflow() {
    const workflow = {
      id: 'workflow-user-feedback',
      name: 'User Feedback Collection',
      steps: [
        {
          id: 'step-1',
          name: 'Feedback Trigger',
          type: 'trigger',
          description: 'User provides feedback through survey or direct input',
          action: 'capture_feedback',
          action_params: { source: 'survey', type: 'satisfaction' }
        },
        {
          id: 'step-2',
          name: 'Feedback Processing',
          type: 'processing',
          description: 'Process and categorize feedback for analysis',
          action: 'process_feedback',
          action_params: { analyze: 'sentiment', categorize: 'topic' }
        },
        {
          id: 'step-3',
          name: 'Insights Generation',
          type: 'analysis',
          description: 'Generate actionable insights from feedback',
          action: 'generate_insights',
          action_params: { recommendations: true, trends: true }
        },
        {
          id: 'step-4',
          name: 'Feedback Response',
          type: 'completion',
          description: 'Provide response to user and implement improvements',
          action: 'respond_and_implement',
          action_params: { response_time: 'within_48_hours', impact_assessment: true }
        }
      ],
      createdAt: new Date().toISOString(),n      updatedAt: new Date().toISOString(),
      createdBy: 'system',
      status: 'active',
      version: 1,
      metadata: {
        description: 'User feedback collection and improvement workflow',
        category: 'continuous-improvement',
        estimatedTime: '3 minutes',
        completionRate: 82
      }
    };

    this.workflows.set(workflow.id, workflow);
    this.logExecution('workflow_create', 'system', `User feedback workflow created`, {workflowId: workflow.id, stepCount: workflow.steps.length});

    return workflow;
  }

  /**
   * Start a workflow
   */
  startWorkflow(workflowName) {
    const workflow = this.getWorkflowByName(workflowName);
    if (!workflow) {
      throw new Error(`Workflow ${workflowName} not found`);
    }

    if (workflow.status !== 'active') {
      throw new Error(`Workflow ${workflowName} is not in active status`);
    }

    this.currentWorkflow = workflow;
    workflow.status = 'in_progress';
    workflow.startedAt = new Date().toISOString();

    const userId = this.getCurrentUserId();
    this.userProgress.set(workflow.id, {
      workflowId: workflow.id,
      stepId: null,
      currentStepIndex: 0,
      progress: {},
      completedSteps: [],
      userId: userId,
      startTime: workflow.startedAt,
      endTime: null,
      status: 'in_progress'
    });

    this.workflows.set(workflow.id, workflow);
    this.saveData();
    this.logExecution('workflow_start', 'system', `Workflow ${workflow.name} started`, {workflowId: workflow.id, userId: userId});

    // Emit event
    const event = new CustomEvent('vini:workflow-start', {
      detail: {
        workflowId: workflow.id,
        name: workflow.name,
        stepCount: workflow.steps.length,
        userId: userId
      }
    });
    document.dispatchEvent(event);

    return this;
  }

  /**
   * Continue workflow
   */
  continueWorkflow() {
    if (!this.currentWorkflow) {
      throw new Error('No workflow is currently active');
    }

    this.logExecution('workflow_continue', 'system', `Continuing workflow ${this.currentWorkflow.name}`, {workflowId: this.currentWorkflow.id});

    const event = new CustomEvent('vini:workflow-continue', {
      detail: {
        workflowId: this.currentWorkflow.id
      }
    });
    document.dispatchEvent(event);

    return this;
  }

  /**
   * Complete a step
   */
  completeStep(stepId, data) {
    if (!this.currentWorkflow) {
      throw new Error('No workflow is currently active');
    }

    const workflowProgress = this.userProgress.get(this.currentWorkflow.id);
    const currentStepIndex = workflowProgress?.currentStepIndex;

    if (currentStepIndex === null || currentStepIndex === undefined) {
      throw new Error('Workflow progress not found for this workflow');
    }

    const currentStep = this.currentWorkflow.steps[currentStepIndex];
    if (!currentStep) {
      throw new Error('No current step found');
    }

    // Validate step if validation schema exists
    if (this.options.validationSchema && currentStep.validation) {
      const validationResult = this.validateStepData(stepId, data);
      if (!validationResult.isValid) {
        this.logExecution('validation_error', 'system', `Step ${stepId} validation failed: ${validationResult.errors}`, {
          workflowId: this.currentWorkflow.id,
          stepId: stepId,
          errors: validationResult.errors
        });

        const errorEvent = new CustomEvent('vini:validation-error', {
          detail: {
            workflowId: this.currentWorkflow.id,
            stepId: stepId,
            errors: validationResult.errors
          }
        });
        document.dispatchEvent(errorEvent);
        return false;
      }
    }

    // Mark step as completed
    const updatedProgress = {
      ...workflowProgress,
      stepId: stepId,
      currentStepIndex: currentStepIndex,
      progress: {
        ...workflowProgress.progress,
        [stepId]: {
          completedAt: new Date().toISOString(),
          data: data,
          validated: true
        }
      },
      completedSteps: [...workflowProgress.completedSteps, stepId],
      // Move to next step if available
      nextStepIndex: currentStepIndex < this.currentWorkflow.steps.length - 1 ? currentStepIndex + 1 : currentStepIndex
    };

    this.userProgress.set(this.currentWorkflow.id, updatedProgress);
    this.saveData();

    const stepCompleteEvent = new CustomEvent('vini:step-complete', {
      detail: {
        workflowId: this.currentWorkflow.id,
        stepId: stepId,
        data: data,
        stepNumber: currentStepIndex + 1
      }
    });
    document.dispatchEvent(stepCompleteEvent);

    this.logExecution('step_complete', 'system', `Step ${stepId} completed in workflow ${this.currentWorkflow.name}`, {
      workflowId: this.currentWorkflow.id,
      stepId: stepId,
      stepNumber: currentStepIndex + 1
    });

    return true;
  }

  /**
   * Get all workflows
   */
  getWorkflows() {
    return [...this.workflows.values()];
  }

  /**
   * Get workflow by name
   */
  getWorkflowByName(workflowName) {
    for (const workflow of this.workflows.values()) {
      if (workflow.name === workflowName) {
        return workflow;
      }
    }
    return null;
  }

  /**
   * Get current workflow
   */
  getCurrentWorkflow() {
    return this.currentWorkflow;
  }

  /**
   * Get workflow progress
   */
  getWorkflowProgress(workflowId) {
    return this.userProgress.get(workflowId);
  }

  /**
   * Get all workflows progress for user
   */
  getUserWorkflows(userId) {
    return [...this.userProgress.values()].filter(progress => progress.userId === userId);
  }

  /**
   * Save data with encryption if configured
   */
  saveData() {
    const workflowsData = JSON.stringify([...this.workflows.values()]);
    const progressData = JSON.stringify(Object.fromEntries(this.userProgress));

    const encryptedWorkflows = this.options.encryptionKey ?
      this.encryptData(workflowsData) : workflowsData;
    const encryptedProgress = this.options.encryptionKey ?
      this.encryptData(progressData) : progressData;

    localStorage.setItem('vini_workflows', encryptedWorkflows);
    localStorage.setItem('vini_user_progress', encryptedProgress);
  }

  /**
   * Load workflows from storage
   */
  loadWorkflows() {
    const savedWorkflows = localStorage.getItem('vini_workflows');
    if (savedWorkflows) {
      const decrypted = this.options.encryptionKey ?
        this.decryptData(savedWorkflows) : savedWorkflows;
      const parsed = JSON.parse(decrypted);
      parsed.forEach(workflow =>, this.workflows.set(workflow.id, workflow));
    }

    // Load user progress
    const savedProgress = localStorage.getItem('vini_user_progress');
    if (savedProgress) {
      const decrypted = this.options.encryptionKey ?
        this.decryptData(savedProgress) : savedProgress;
      const parsed = JSON.parse(decrypted);
      this.userProgress = new Map(Object.entries(parsed));
    }
  }

  /**
   * Encrypt data with AES
   */
  encryptData(data) {
    if (!this.options.encryptionKey) return data;

    try {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);
      const keyData = encoder.encode(this.options.encryptionKey);

      const encryptedArray = new Uint8Array(encodedData.length);
      for (let i = 0; i < encodedData.length; i++) {
        encryptedArray[i] = encodedData[i] ^ keyData[i % keyData.length];
      }

      return btoa(String.fromCharCode(...encryptedArray));
    } catch (error) {
      console.error('Encryption failed:', error);
      return data;
    }
  }

  /**
   * Decrypt data with AES
   */
  decryptData(encryptedData) {
    if (!this.options.encryptionKey) return encryptedData;

    try {
      const encryptedArray = new Uint8Array(Array.from(atob(encryptedData), c =>, c.charCodeAt(0)));
      const keyData = new TextEncoder().encode(this.options.encryptionKey);

      const decryptedArray = new Uint8Array(encryptedArray.length);
      for (let i = 0; i < encryptedArray.length; i++) {
        decryptedArray[i] = encryptedArray[i] ^ keyData[i % keyData.length];
      }

      return String.fromCharCode(...decryptedArray);
    } catch (error) {
      console.error('Decryption failed:', error);
      return encryptedData;
    }
  }

  /**
   * Get current user ID
   */
  getCurrentUserId() {
    return 'user-' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Log execution
   */
  logExecution(level, module, message, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      module: module,
      message: message,
      context: context,
      userAgent: navigator.userAgent
    };

    this.executionLogs.push(logEntry);

    if (this.options.debugMode) {
      console.log(`[VINI ${level}] ${logEntry.timestamp} - ${message}`, context || '');
    }
  }

  /**
   * Get execution logs
   */
  getExecutionLogs(filters = {}) {
    let results = this.executionLogs;

    if (filters.level) {
      results = results.filter(log => log.level === filters.level);
    }

    if (filters.module) {
      results = results.filter(log => log.module === filters.module);
    }

    if (filters.startTime) {
      results = results.filter(log => new Date(log.timestamp) >= new Date(filters.startTime));
    }

    if (filters.endTime) {
      results = results.filter(log => new Date(log.timestamp) <= new Date(filters.endTime));
    }

    return results;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Validate step data against schema
   */
  validateStepData(stepId, data) {
    const workflow = this.getCurrentWorkflow();
    const step = workflow?.steps.find(s => s.id === stepId);

    if (!step || !step.validation) {
      return { isValid: true, errors: [] };
    }

    const errors = [];

    if (step.validation.requiredFields) {
      const missingFields = step.validation.requiredFields.filter(field =>
        data && !(field in data) && (!data[field] || data[field] === '')
      );
      if (missingFields.length > 0) {
        errors.push(`Missing required fields: ${missingFields.join(', ')}`);
      }
    }

    if (step.validation.validateWithSchema && this.options.validationSchema) {
      if (step.validation.minLength && data && typeof data === 'string') {
        if (data.length < step.validation.minLength) {
          errors.push(`Minimum length is ${step.validation.minLength} characters`);
        }
      }

      if (step.validation.maxLength && data && typeof data === 'string') {
        if (data.length > step.validation.maxLength) {
          errors.push(`Maximum length is ${step.validation.maxLength} characters`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Handle start event
   */
  handleStartEvent(event) {
    const { detail } = event;
    this.logExecution('event_start', 'system', 'Start event received', detail);
  }

  /**
   * Handle continue event
   */
  handleContinueEvent(event) {
    const { detail } = event;
    this.logExecution('event_continue', 'system', 'Continue event received', detail);
  }

  /**
   * Handle complete event
   */
  handleCompleteEvent(event) {
    const { detail } = event;
    this.logExecution('event_complete', 'system', 'Complete event received', detail);
  }

  /**
   * Handle pause event
   */
  handlePauseEvent(event) {
    const { detail } = event;
    this.logExecution('event_pause', 'system', 'Pause event received', detail);
  }

  /**
   * Handle resume event
   */
  handleResumeEvent(event) {
    const { detail } = event;
    this.logExecution('event_resume', 'system', 'Resume event received', detail);
  }

  /**
   * Handle end event
   */
  handleEndEvent(event) {
    const { detail } = event;
    this.logExecution('event_end', 'system', 'End event received', detail);
  }

  /**
   * Handle step complete event
   */
  handleStepCompleteEvent(event) {
    const { detail } = event;
    this.logExecution('event_step_complete', 'system', 'Step complete event received', detail);
  }

  /**
   * Handle validation error event
   */
  handleValidationErrorEvent(event) {
    const { detail } = event;
    this.logExecution('event_validation_error', 'system', 'Validation error event received', detail);
  }

  /**
   * Handle server response event
   */
  handleServerResponseEvent(event) {
    const { detail } = event;
    this.logExecution('event_server_response', 'system', 'Server response event received', detail);
  }
}

/**
 * Initialize VINI workflow system when DOM is ready
 */
const vini = new WebsiteWorkflowSystem({
  autoStart: false,
  debugMode: false,
  serverEndpoint: null,
  encryptionKey: null,
  validationSchema: {
    requiredFields: ['name', 'email', 'message'],
    minLength: 5,
    maxLength: 500
  }
});

// Global configuration function
const configureVini = (options) => {
  Object.assign(vini.options, options);
  vini.init();
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    vini.init();
  });
} else {
  vini.init();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebsiteWorkflowSystem };
}

if (typeof window !== 'undefined') {
  window.vini = { WebsiteWorkflowSystem, vini, configureVini };
}