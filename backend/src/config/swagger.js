/**
 * OpenAPI/Swagger Configuration
 * Comprehensive API documentation for the StarkEd Education Backend
 *
 * This file defines the OpenAPI 3.0 specification for all backend API endpoints,
 * including request/response schemas, authentication schemes, and example values.
 *
 * ── Documentation Strategy ──────────────────────────────────────
 * This codebase uses a mix of JavaScript and TypeScript with inline validation
 * schemas (Joi / express-validator) scattered across route files. Rather than
 * duplicating annotations in JSDoc strings on every route handler, we maintain
 * a single centralized OpenAPI spec that mirrors the actual route structure.
 *
 * To keep docs in sync with code:
 * 1. When adding a new endpoint, add its path + schemas here at the same time
 * 2. Run `npm test:scripts` or manually curl /api-docs.json to verify the spec
 * 3. Frontend types are auto-generated via `npm run generate-api-types` in the
 *    frontend directory, which pulls the live spec from the running backend
 *
 * @see https://swagger.io/specification/
 */

const swaggerJsdoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'StarkEd Education Backend API',
    version: '1.0.0',
    description: `
      **StarkEd** is a decentralized learning and credential verification platform built on the Stellar blockchain.
      
      This API provides endpoints for:
      - User authentication and management
      - Course content management with version control
      - Quiz creation, submission, and grading
      - Course enrollment and progress tracking
      - Payment processing (Stellar and fiat)
      - Decentralized content storage via IPFS
      - Search, recommendations, and discovery
      - Notifications and real-time events
      - Smart wallet operations with multi-sig and social recovery
      - Federated learning and swarm intelligence
      - Advanced cryptographic operations (VRF, time-lock credentials)
      - Cross-chain messaging and state proofs
      - AI-powered tutoring and translation services
    `,
    contact: {
      name: 'StarkEd Team',
      url: 'https://github.com/Epondia/starked-education',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  externalDocs: {
    description: 'GitHub Repository',
    url: 'https://github.com/Epondia/starked-education',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development server',
    },
    {
      url: 'https://api.starked.dev/v1',
      description: 'Production API',
    },
  ],
  tags: [
    { name: 'Health', description: 'Health check and monitoring endpoints' },
    { name: 'Authentication', description: 'User authentication, registration, and profile management' },
    { name: 'Users', description: 'User profiles, settings, and achievements' },
    { name: 'Courses', description: 'Course content version management' },
    { name: 'Content', description: 'IPFS-based content storage and management' },
    { name: 'Quizzes', description: 'Quiz CRUD, submission, and grading' },
    { name: 'Enrollments', description: 'Course enrollment and progress tracking' },
    { name: 'Assignments', description: 'Assignment management and submission grading' },
    { name: 'Payments', description: 'Payment processing with Stellar and fiat support' },
    { name: 'Search', description: 'Search, recommendations, and discovery' },
    { name: 'Notifications', description: 'User notification management' },
    { name: 'Sync', description: 'Device synchronization and offline queue management' },
    { name: 'Events', description: 'Event logging and audit trail' },
    { name: 'RBAC', description: 'Role-based access control management' },
    { name: 'Collaboration', description: 'Collaboration room management' },
    { name: 'Holographic', description: 'Holographic storage abstraction layer' },
    { name: 'ACO', description: 'Ant Colony Optimization for learning paths and resources' },
    { name: 'Federated Learning', description: 'Federated learning session and model management' },
    { name: 'Swarm Learning', description: 'Swarm intelligence-based learning coordination' },
    { name: 'Smart Wallet', description: 'Smart contract wallet operations' },
    { name: 'Secure Communication', description: 'Quantum-resistant secure communication' },
    { name: 'AGI Tutor', description: 'AI-powered adaptive tutoring system' },
    { name: 'Analytics', description: 'Platform analytics and reporting' },
    { name: 'Time-Lock Credentials', description: 'Time-locked credential issuance and release' },
    { name: 'VRF', description: 'Verifiable Random Function operations' },
    { name: 'Translation', description: 'Real-time multi-language translation' },
    { name: 'Cross-Protocol Bridge', description: 'Cross-chain messaging and state proofs' },
    { name: 'Admin', description: 'Administrative dashboard and system management' },
    { name: 'Gamification', description: 'Gamification and achievement system' },
    { name: 'Autonomous Agents', description: 'Autonomous agent management' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT authentication token. Obtain by calling POST /api/v1/auth/login',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key for service-to-service authentication',
      },
    },
    schemas: {
      // ──────────────────────────────────────────────
      // Error Schemas
      // ──────────────────────────────────────────────
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Not Found' },
          message: { type: 'string', example: 'Resource not found' },
          details: { type: 'object', description: 'Additional error details (development only)' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },

      // ──────────────────────────────────────────────
      // Auth Schemas
      // ──────────────────────────────────────────────
      RegisterRequest: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50, example: 'johndoe' },
          email: { type: 'string', format: 'email', example: 'john@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 128, example: 'securePass123' },
          role: { type: 'string', enum: ['student', 'educator', 'admin'], example: 'student' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'johndoe' },
          password: { type: 'string', example: 'securePass123' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Login successful' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1700000000000' },
              username: { type: 'string', example: 'johndoe' },
              email: { type: 'string', example: 'john@example.com' },
              role: { type: 'string', example: 'student' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'user_123' },
          username: { type: 'string', example: 'johndoe' },
          email: { type: 'string', example: 'john@example.com' },
          role: { type: 'string', enum: ['student', 'educator', 'admin'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UpdateProfileRequest: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50 },
          email: { type: 'string', format: 'email' },
          currentPassword: { type: 'string', description: 'Required when changing password' },
          newPassword: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
      AssignRoleRequest: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['student', 'educator', 'admin'] },
        },
      },
      PaginatedUsersResponse: {
        type: 'object',
        properties: {
          users: { type: 'array', items: { $ref: '#/components/schemas/UserProfile' } },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 10 },
              total: { type: 'integer', example: 42 },
              pages: { type: 'integer', example: 5 },
            },
          },
        },
      },

      // ──────────────────────────────────────────────
      // Health Schemas
      // ──────────────────────────────────────────────
      LivenessResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          uptime: { type: 'number', example: 12345.67 },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ReadinessResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ready' },
          dependencies: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['healthy', 'unhealthy'] },
              },
            },
          },
        },
      },
      HealthCheckResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded'] },
          version: { type: 'string', example: '1.0.0' },
          uptime: { type: 'number' },
          timestamp: { type: 'string', format: 'date-time' },
          memory: {
            type: 'object',
            properties: {
              heapUsed: { type: 'number' },
              heapTotal: { type: 'number' },
              rss: { type: 'number' },
            },
          },
          dependencies: {
            type: 'object',
            properties: {
              postgres: { $ref: '#/components/schemas/DependencyHealth' },
              redis: { $ref: '#/components/schemas/DependencyHealth' },
              stellar: { $ref: '#/components/schemas/DependencyHealth' },
              ipfs: { $ref: '#/components/schemas/DependencyHealth' },
              elasticsearch: { $ref: '#/components/schemas/DependencyHealth' },
            },
          },
        },
      },
      DependencyHealth: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'unhealthy'] },
          latencyMs: { type: 'number', example: 42 },
          error: { type: 'string', example: 'Connection refused' },
        },
      },

      // ──────────────────────────────────────────────
      // Content / IPFS Schemas
      // ──────────────────────────────────────────────
      ContentUploadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'File uploaded successfully' },
          data: {
            type: 'object',
            properties: {
              cid: { type: 'string', example: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco' },
              metadataCid: { type: 'string' },
              metadata: { type: 'object' },
              size: { type: 'integer', example: 1024 },
              gatewayUrl: { type: 'string', example: 'https://ipfs.io/ipfs/QmXoy...' },
            },
          },
        },
      },
      BatchUploadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    cid: { type: 'string' },
                    error: { type: 'string' },
                  },
                },
              },
              summary: {
                type: 'object',
                properties: {
                  total: { type: 'integer' },
                  successful: { type: 'integer' },
                  failed: { type: 'integer' },
                },
              },
            },
          },
        },
      },

      // ──────────────────────────────────────────────
      // Course / Version Control Schemas
      // ──────────────────────────────────────────────
      CreateVersionRequest: {
        type: 'object',
        required: ['title', 'description', 'content', 'changes', 'createdBy'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200, example: 'Updated Lesson Content' },
          description: { type: 'string', minLength: 10, maxLength: 1000 },
          content: { type: 'object', example: { sections: [{ id: 's1', body: '...' }] } },
          changes: {
            type: 'array',
            items: { type: 'string' },
            example: ['Updated introduction', 'Added new examples'],
          },
          createdBy: { type: 'string', example: 'user_456' },
        },
      },
      ContentVersion: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'ver_123' },
          contentId: { type: 'string' },
          version: { type: 'integer', example: 1 },
          title: { type: 'string' },
          description: { type: 'string' },
          content: { type: 'object' },
          changes: { type: 'array', items: { type: 'string' } },
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          isCurrent: { type: 'boolean' },
        },
      },
      VersionHistoryResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              versions: { type: 'array', items: { $ref: '#/components/schemas/ContentVersion' } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
          },
        },
      },
      VersionComparisonResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              version1: { type: 'object' },
              version2: { type: 'object' },
              differences: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    oldValue: {},
                    newValue: {},
                    changeType: { type: 'string', enum: ['added', 'modified', 'removed'] },
                  },
                },
              },
              summary: {
                type: 'object',
                properties: {
                  totalChanges: { type: 'integer' },
                  additions: { type: 'integer' },
                  modifications: { type: 'integer' },
                  removals: { type: 'integer' },
                },
              },
            },
          },
        },
      },

      // ──────────────────────────────────────────────
      // Quiz Schemas
      // ──────────────────────────────────────────────
      Quiz: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'quiz_123' },
          title: { type: 'string' },
          description: { type: 'string' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['multiple_choice', 'true_false', 'short_answer', 'essay'] },
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                points: { type: 'integer' },
              },
            },
          },
          timeLimit: { type: 'integer', description: 'Time limit in minutes' },
          passingScore: { type: 'integer' },
          published: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      QuizSubmission: {
        type: 'object',
        required: ['answers'],
        properties: {
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                questionId: { type: 'string' },
                answer: { type: 'string' },
              },
            },
          },
        },
      },
      QuizResult: {
        type: 'object',
        properties: {
          submissionId: { type: 'string' },
          quizId: { type: 'string' },
          score: { type: 'number' },
          totalPoints: { type: 'number' },
          percentage: { type: 'number' },
          passed: { type: 'boolean' },
          answers: { type: 'array', items: { type: 'object' } },
          submittedAt: { type: 'string', format: 'date-time' },
          gradedAt: { type: 'string', format: 'date-time' },
        },
      },

      // ──────────────────────────────────────────────
      // Enrollment Schemas
      // ──────────────────────────────────────────────
      Enrollment: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'enr_123' },
          userId: { type: 'string' },
          courseId: { type: 'string' },
          status: { type: 'string', enum: ['active', 'completed', 'cancelled', 'expired'] },
          progress: { type: 'number', example: 45 },
          enrolledAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateEnrollmentRequest: {
        type: 'object',
        required: ['courseId'],
        properties: {
          courseId: { type: 'string', example: 'course_123' },
          paymentMethod: { type: 'string' },
        },
      },

      // ──────────────────────────────────────────────
      // Payment Schemas
      // ──────────────────────────────────────────────
      PaymentIntent: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'pi_123' },
          amount: { type: 'number', example: 9999 },
          currency: { type: 'string', example: 'USD' },
          status: { type: 'string', enum: ['pending', 'completed', 'failed', 'refunded'] },
          paymentMethod: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      StellarPaymentRequest: {
        type: 'object',
        required: ['amount', 'destination'],
        properties: {
          amount: { type: 'string', example: '100.50' },
          destination: { type: 'string', example: 'GABCD...1234' },
          assetCode: { type: 'string', example: 'USDC' },
          memo: { type: 'string' },
        },
      },
      PaymentSettings: {
        type: 'object',
        properties: {
          supportedCurrencies: { type: 'array', items: { type: 'string' } },
          supportedMethods: { type: 'array', items: { type: 'string' } },
          stellarFee: { type: 'number' },
          minPayment: { type: 'number' },
          maxPayment: { type: 'number' },
        },
      },

      // ──────────────────────────────────────────────
      // Search Schemas
      // ──────────────────────────────────────────────
      SearchQuery: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          filters: { type: 'object' },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
        },
      },
      SearchResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              results: { type: 'array', items: { type: 'object' } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              query: { type: 'string' },
            },
          },
        },
      },
      VoiceSearchRequest: {
        type: 'object',
        properties: {
          transcript: { type: 'string', description: 'Voice transcript text' },
          query: { type: 'string', description: 'Alternative text query' },
          filters: { type: 'object' },
          userId: { type: 'string' },
          sessionId: { type: 'string' },
        },
        minProperties: 1,
      },

      // ──────────────────────────────────────────────
      // Notification Schemas
      // ──────────────────────────────────────────────
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'notif_123' },
          userId: { type: 'string' },
          type: { type: 'string', enum: ['info', 'warning', 'success', 'error'] },
          title: { type: 'string' },
          message: { type: 'string' },
          read: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      NotificationPreferences: {
        type: 'object',
        properties: {
          email: { type: 'boolean', example: true },
          push: { type: 'boolean', example: true },
          inApp: { type: 'boolean', example: true },
          types: {
            type: 'object',
            properties: {
              enrollment: { type: 'boolean' },
              grading: { type: 'boolean' },
              credential: { type: 'boolean' },
              system: { type: 'boolean' },
            },
          },
        },
      },

      // ──────────────────────────────────────────────
      // Sync Schemas
      // ──────────────────────────────────────────────
      DeviceRegistration: {
        type: 'object',
        required: ['deviceId', 'deviceType', 'pushToken'],
        properties: {
          deviceId: { type: 'string', example: 'device_abc123' },
          deviceType: { type: 'string', enum: ['mobile', 'desktop', 'tablet', 'web'] },
          pushToken: { type: 'string' },
          platform: { type: 'string', example: 'ios' },
        },
      },
      SyncEntity: {
        type: 'object',
        required: ['entityType', 'entityId', 'data', 'timestamp'],
        properties: {
          entityType: { type: 'string', example: 'course_progress' },
          entityId: { type: 'string' },
          data: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },

      // ──────────────────────────────────────────────
      // Event Logger Schemas
      // ──────────────────────────────────────────────
      LogCourseCompletionRequest: {
        type: 'object',
        required: ['userId', 'courseId'],
        properties: {
          userId: { type: 'string' },
          courseId: { type: 'string' },
          grade: { type: 'string' },
          completedAt: { type: 'string', format: 'date-time' },
        },
      },
      LogCredentialIssuanceRequest: {
        type: 'object',
        required: ['userId', 'credentialType'],
        properties: {
          userId: { type: 'string' },
          credentialType: { type: 'string' },
          credentialHash: { type: 'string' },
          issuedAt: { type: 'string', format: 'date-time' },
        },
      },
      LogUserAchievementRequest: {
        type: 'object',
        required: ['userId', 'achievementType'],
        properties: {
          userId: { type: 'string' },
          achievementType: { type: 'string' },
          metadata: { type: 'object' },
          achievedAt: { type: 'string', format: 'date-time' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'evt_123' },
          eventType: { type: 'string', enum: ['course_completion', 'credential_issuance', 'user_achievement', 'profile_update', 'course_enrollment'] },
          userId: { type: 'string' },
          data: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
          verified: { type: 'boolean' },
        },
      },

      // ──────────────────────────────────────────────
      // Collaboration Schemas
      // ──────────────────────────────────────────────
      CreateRoomRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Study Group - Physics 101' },
          description: { type: 'string' },
          maxParticipants: { type: 'integer', example: 10 },
          isPrivate: { type: 'boolean', example: false },
        },
      },
      CollaborationRoom: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'room_123' },
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['active', 'ended'] },
          participantCount: { type: 'integer' },
          maxParticipants: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // ──────────────────────────────────────────────
      // Smart Wallet Schemas
      // ──────────────────────────────────────────────
      CreateWalletRequest: {
        type: 'object',
        required: ['ownerAddress'],
        properties: {
          ownerAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f9bD28' },
          guardians: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
                name: { type: 'string' },
              },
            },
          },
          threshold: { type: 'integer', minimum: 1, maximum: 50, example: 2 },
        },
      },
      ExecuteTransactionRequest: {
        type: 'object',
        required: ['walletAddress', 'to', 'value', 'data', 'signature'],
        properties: {
          walletAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          to: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          value: { type: 'string', pattern: '^[0-9]+$', description: 'Value as non-negative integer string (BigInt)' },
          data: { type: 'string', pattern: '^0x([a-fA-F0-9]{2})*$', description: 'Hex-encoded calldata' },
          signature: { type: 'string', pattern: '^0x[a-fA-F0-9]{130}$', description: '65-byte EIP-191 signature' },
        },
      },
      SetupSocialRecoveryRequest: {
        type: 'object',
        required: ['walletAddress', 'guardians', 'threshold'],
        properties: {
          walletAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          guardians: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
                name: { type: 'string' },
              },
            },
            minItems: 1,
            maxItems: 50,
          },
          threshold: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },
      InitiateRecoveryRequest: {
        type: 'object',
        required: ['walletAddress', 'newOwner', 'guardianAddress', 'guardianSignature'],
        properties: {
          walletAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          newOwner: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          guardianAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          guardianSignature: { type: 'string', pattern: '^0x[a-fA-F0-9]{130}$' },
        },
      },
      SetupMultiSigRequest: {
        type: 'object',
        required: ['walletAddress', 'signers', 'threshold'],
        properties: {
          walletAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          signers: {
            type: 'array',
            items: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
            minItems: 2,
            maxItems: 20,
          },
          threshold: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
      CreateSessionKeyRequest: {
        type: 'object',
        required: ['walletAddress', 'permissions', 'validUntil'],
        properties: {
          walletAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          permissions: {
            type: 'object',
            properties: {
              allowedContracts: { type: 'array', items: { type: 'string' } },
              allowedMethods: { type: 'array', items: { type: 'string' } },
              spendingLimit: { type: 'string', pattern: '^[0-9]+$' },
            },
            required: ['allowedContracts', 'allowedMethods', 'spendingLimit'],
          },
          validUntil: { type: 'string', format: 'date-time', description: 'Must be in the future' },
        },
      },

      // ──────────────────────────────────────────────
      // Federated Learning Schemas
      // ──────────────────────────────────────────────
      FederatedSessionRequest: {
        type: 'object',
        required: ['modelType', 'minParticipants', 'rounds', 'aggregationStrategy'],
        properties: {
          modelType: { type: 'string', maxLength: 100, example: 'neural_network' },
          minParticipants: { type: 'integer', minimum: 1, maximum: 10000, example: 5 },
          rounds: { type: 'integer', minimum: 1, maximum: 10000, example: 10 },
          aggregationStrategy: { type: 'string', enum: ['fedAvg', 'fedProx', 'scaffold', 'mime'] },
        },
      },
      RegisterParticipantRequest: {
        type: 'object',
        required: ['sessionId', 'publicKey', 'institutionId', 'endpoint'],
        properties: {
          sessionId: { type: 'string' },
          publicKey: { type: 'string', maxLength: 1024 },
          institutionId: { type: 'string' },
          endpoint: { type: 'string', format: 'uri' },
        },
      },
      SubmitModelUpdateRequest: {
        type: 'object',
        required: ['roundNumber', 'modelWeights'],
        properties: {
          roundNumber: { type: 'integer', minimum: 0 },
          modelWeights: { type: 'object' },
          metrics: { type: 'object' },
        },
      },

      // ──────────────────────────────────────────────
      // Swarm Learning Schemas
      // ──────────────────────────────────────────────
      InitializeSwarmRequest: {
        type: 'object',
        required: ['modelType', 'swarmSize'],
        properties: {
          modelType: { type: 'string', maxLength: 100 },
          swarmSize: { type: 'integer', minimum: 2, maximum: 1000 },
          consensusProtocol: { type: 'string', enum: ['gossip', 'all_reduce', 'ring', 'tree'] },
          topology: { type: 'string', enum: ['mesh', 'star', 'ring', 'random'] },
        },
      },
      CreateSwarmRequest: {
        type: 'object',
        required: ['name', 'taskType'],
        properties: {
          name: { type: 'string', maxLength: 200 },
          taskType: { type: 'string' },
          config: {
            type: 'object',
            properties: {
              minParticipants: { type: 'integer', minimum: 1 },
              maxParticipants: { type: 'integer', minimum: 1 },
              learningRate: { type: 'number', minimum: 0 },
            },
          },
        },
      },
      RegisterAgentRequest: {
        type: 'object',
        required: ['swarmId', 'agentId'],
        properties: {
          swarmId: { type: 'string' },
          agentId: { type: 'string' },
          endpoint: { type: 'string', format: 'uri' },
          capabilities: { type: 'object' },
        },
      },

      // ──────────────────────────────────────────────
      // AGI Tutor Schemas
      // ──────────────────────────────────────────────
      GenerateSessionRequest: {
        type: 'object',
        required: ['userId', 'topic'],
        properties: {
          userId: { type: 'string' },
          topic: { type: 'string', example: 'Quantum Computing' },
          difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          preferredStyle: { type: 'string', enum: ['visual', 'textual', 'interactive'] },
        },
      },
      ProcessResponseRequest: {
        type: 'object',
        required: ['sessionId', 'response'],
        properties: {
          sessionId: { type: 'string' },
          response: { type: 'string' },
          context: { type: 'object' },
        },
      },
      GenerateAssessmentRequest: {
        type: 'object',
        required: ['userId', 'topic'],
        properties: {
          userId: { type: 'string' },
          topic: { type: 'string' },
          difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          questionCount: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },

      // ──────────────────────────────────────────────
      // Time-Lock Credential Schemas
      // ──────────────────────────────────────────────
      IssueCredentialRequest: {
        type: 'object',
        required: ['recipient', 'credentialHash', 'metadata', 'releaseTime'],
        properties: {
          recipient: { type: 'string', description: 'Recipient Stellar address' },
          credentialHash: { type: 'string', description: 'Hash of the credential content' },
          metadata: { type: 'object', description: 'Additional metadata' },
          releaseTime: { type: 'string', format: 'date-time', description: 'When the credential becomes available' },
        },
      },
      TimeLockCredential: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          issuer: { type: 'string' },
          recipient: { type: 'string' },
          credentialHash: { type: 'string' },
          metadata: { type: 'object' },
          status: { type: 'string', enum: ['locked', 'released', 'revoked'] },
          releaseTime: { type: 'string', format: 'date-time' },
          issuedAt: { type: 'string', format: 'date-time' },
          releasedAt: { type: 'string', format: 'date-time' },
        },
      },
      BatchReleaseRequest: {
        type: 'object',
        required: ['credentialIds'],
        properties: {
          credentialIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
      },
      CreateReleaseScheduleRequest: {
        type: 'object',
        required: ['credentialIds', 'releaseTimes'],
        properties: {
          credentialIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          releaseTimes: { type: 'array', items: { type: 'string', format: 'date-time' }, minItems: 1 },
        },
      },
      EmergencyRevokeRequest: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', description: 'Reason for emergency revocation' },
        },
      },

      // ──────────────────────────────────────────────
      // VRF Schemas
      // ──────────────────────────────────────────────
      VRFRequest: {
        type: 'object',
        required: ['seed', 'purpose'],
        properties: {
          seed: { type: 'string', description: 'Seed for randomness generation' },
          purpose: { type: 'string', description: 'Purpose identifier' },
          context: { type: 'string', description: 'Optional context' },
        },
      },
      VRFGenerateRequest: {
        type: 'object',
        required: ['purpose', 'seed', 'min', 'max'],
        properties: {
          purpose: { type: 'string' },
          seed: { type: 'string' },
          min: { type: 'integer', minimum: 0 },
          max: { type: 'integer', minimum: 0 },
        },
      },
      VRFCommitRequest: {
        type: 'object',
        required: ['commitmentHash', 'validUntil'],
        properties: {
          commitmentHash: { type: 'string', description: 'Hash of the committed value' },
          validUntil: { type: 'string', format: 'date-time' },
        },
      },
      VRFRevealRequest: {
        type: 'object',
        required: ['revealedValue'],
        properties: {
          revealedValue: { type: 'string' },
        },
      },

      // ──────────────────────────────────────────────
      // Translation Schemas
      // ──────────────────────────────────────────────
      TranslateTextRequest: {
        type: 'object',
        required: ['text', 'sourceLanguage', 'targetLanguage'],
        properties: {
          text: { type: 'string' },
          sourceLanguage: { type: 'string', example: 'en' },
          targetLanguage: { type: 'string', example: 'es' },
          context: { type: 'string' },
          contentType: { type: 'string', enum: ['course', 'subtitle', 'interaction', 'general'] },
        },
      },
      BatchTranslateRequest: {
        type: 'object',
        required: ['requests'],
        properties: {
          requests: {
            type: 'array',
            items: { $ref: '#/components/schemas/TranslateTextRequest' },
            minItems: 1,
          },
        },
      },
      TranslateSubtitlesRequest: {
        type: 'object',
        required: ['segments', 'targetLanguage'],
        properties: {
          segments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                startTime: { type: 'number' },
                endTime: { type: 'number' },
                text: { type: 'string' },
              },
            },
            minItems: 1,
          },
          targetLanguage: { type: 'string' },
        },
      },
      SubmitCorrectionRequest: {
        type: 'object',
        required: ['originalText', 'translation', 'correctedTranslation'],
        properties: {
          originalText: { type: 'string' },
          translation: { type: 'string' },
          correctedTranslation: { type: 'string' },
          context: { type: 'string' },
        },
      },

      // ──────────────────────────────────────────────
      // Cross-Protocol Bridge Schemas
      // ──────────────────────────────────────────────
      BridgeSendRequest: {
        type: 'object',
        required: ['destinationChain', 'payload', 'messageType', 'gasLimit'],
        properties: {
          destinationChain: { type: 'integer', minimum: 0, description: 'Destination chain ID' },
          payload: { type: 'string', description: 'Message payload' },
          messageType: { type: 'string', enum: ['CredentialVerification', 'DataSync', 'TokenTransfer', 'GovernanceVote', 'Custom'] },
          gasLimit: { type: 'integer', minimum: 1 },
        },
      },
      BridgeBatchRequest: {
        type: 'object',
        required: ['messageIds'],
        properties: {
          messageIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
      },
      BridgeProofRequest: {
        type: 'object',
        required: ['blockNumber', 'stateRoot', 'proofData', 'validatorSignatures'],
        properties: {
          blockNumber: { type: 'integer', minimum: 0 },
          stateRoot: { type: 'string' },
          proofData: { type: 'string' },
          validatorSignatures: { type: 'array', items: { type: 'string' }, minItems: 3 },
        },
      },

      // ──────────────────────────────────────────────
      // Admin Schemas
      // ──────────────────────────────────────────────
      AdminDashboardStats: {
        type: 'object',
        properties: {
          totalUsers: { type: 'integer' },
          totalCourses: { type: 'integer' },
          totalEnrollments: { type: 'integer' },
          totalRevenue: { type: 'number' },
          activeUsers: { type: 'integer' },
          recentSignups: { type: 'integer' },
        },
      },
      SystemLog: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          level: { type: 'string', enum: ['info', 'warning', 'error', 'debug'] },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          metadata: { type: 'object' },
        },
      },
      PaginatedLogsResponse: {
        type: 'object',
        properties: {
          logs: { type: 'array', items: { $ref: '#/components/schemas/SystemLog' } },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              pages: { type: 'integer' },
            },
          },
          filters: { type: 'object' },
        },
      },
      SystemSettings: {
        type: 'object',
        properties: {
          general: {
            type: 'object',
            properties: {
              siteName: { type: 'string' },
              siteDescription: { type: 'string' },
              maintenanceMode: { type: 'boolean' },
              registrationEnabled: { type: 'boolean' },
              emailVerificationRequired: { type: 'boolean' },
            },
          },
          security: {
            type: 'object',
            properties: {
              passwordMinLength: { type: 'integer' },
              sessionTimeout: { type: 'integer' },
              maxLoginAttempts: { type: 'integer' },
              lockoutDuration: { type: 'integer' },
            },
          },
          features: {
            type: 'object',
            properties: {
              coursesEnabled: { type: 'boolean' },
              quizzesEnabled: { type: 'boolean' },
              certificatesEnabled: { type: 'boolean' },
              socialFeaturesEnabled: { type: 'boolean' },
            },
          },
          limits: {
            type: 'object',
            properties: {
              maxCoursesPerUser: { type: 'integer' },
              maxQuizzesPerCourse: { type: 'integer' },
              maxFileSize: { type: 'integer' },
              maxUsersPerPlan: { type: 'integer' },
            },
          },
        },
      },
      UpdateSettingsRequest: {
        type: 'object',
        required: ['category', 'settings'],
        properties: {
          category: { type: 'string', enum: ['general', 'security', 'features', 'limits'] },
          settings: { type: 'object', minProperties: 1, description: 'Settings key-value pairs' },
        },
      },
      BackupRequest: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['full', 'incremental', 'differential'] },
          includeFiles: { type: 'boolean' },
        },
      },
      CreateAnnouncementRequest: {
        type: 'object',
        required: ['title', 'message'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          message: { type: 'string', maxLength: 5000 },
          targetRoles: { type: 'array', items: { type: 'string' } },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      Announcement: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          message: { type: 'string' },
          priority: { type: 'string' },
          targetRoles: { type: 'array', items: { type: 'string' } },
          active: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          createdBy: { type: 'string' },
        },
      },

      // ──────────────────────────────────────────────
      // Assignment Schemas
      // ──────────────────────────────────────────────
      Assignment: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'assign_123' },
          courseId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          dueDate: { type: 'string', format: 'date-time' },
          maxPoints: { type: 'integer' },
          attachments: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Submission: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          assignmentId: { type: 'string' },
          studentId: { type: 'string' },
          content: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['draft', 'submitted', 'graded'] },
          grade: { type: 'number' },
          feedback: { type: 'string' },
          submittedAt: { type: 'string', format: 'date-time' },
          gradedAt: { type: 'string', format: 'date-time' },
        },
      },
      GradeSubmissionRequest: {
        type: 'object',
        required: ['grade', 'feedback'],
        properties: {
          grade: { type: 'number', minimum: 0, maximum: 100 },
          feedback: { type: 'string', maxLength: 5000 },
        },
      },

      // ──────────────────────────────────────────────
      // Analytics Schemas
      // ──────────────────────────────────────────────
      OverviewStats: {
        type: 'object',
        properties: {
          totalUsers: { type: 'integer' },
          activeUsers: { type: 'integer' },
          totalCourses: { type: 'integer' },
          totalEnrollments: { type: 'integer' },
          completionRate: { type: 'number' },
          averageRating: { type: 'number' },
          revenue: { type: 'number' },
        },
      },
      EnrollmentTrend: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          enrollments: { type: 'integer' },
          cancellations: { type: 'integer' },
        },
      },
      CompletionRate: {
        type: 'object',
        properties: {
          courseId: { type: 'string' },
          courseName: { type: 'string' },
          enrolled: { type: 'integer' },
          completed: { type: 'integer' },
          rate: { type: 'number' },
        },
      },

      // ──────────────────────────────────────────────
      // ACO Schemas
      // ──────────────────────────────────────────────
      ACOLearningSetupRequest: {
        type: 'object',
        required: ['courses'],
        properties: {
          courses: { type: 'array', items: { type: 'string' }, minItems: 1 },
          dependencies: { type: 'object' },
        },
      },
      ACOOptimizeRequest: {
        type: 'object',
        required: ['startCourse', 'endCourse'],
        properties: {
          startCourse: { type: 'string' },
          endCourse: { type: 'string' },
          preferences: { type: 'object' },
        },
      },
      ACOAlternativesRequest: {
        type: 'object',
        required: ['startCourse', 'endCourse'],
        properties: {
          startCourse: { type: 'string' },
          endCourse: { type: 'string' },
          numAlternatives: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
      ACOResourceSetupRequest: {
        type: 'object',
        required: ['resources'],
        properties: {
          resources: { type: 'array', minItems: 1 },
          demands: { type: 'array' },
          constraints: { type: 'array' },
          objectives: { type: 'array' },
        },
      },
      ACOReplanningInitRequest: {
        type: 'object',
        required: ['userId', 'startCourse', 'endCourse'],
        properties: {
          userId: { type: 'string' },
          startCourse: { type: 'string' },
          endCourse: { type: 'string' },
          preferences: { type: 'object' },
        },
      },
      ACOReplanningEventRequest: {
        type: 'object',
        required: ['type', 'data'],
        properties: {
          type: { type: 'string' },
          data: { type: 'object' },
        },
      },
      ACOSwarmAddAgentRequest: {
        type: 'object',
        required: ['agentId', 'agent'],
        properties: {
          agentId: { type: 'string' },
          agent: { type: 'object' },
          specialization: { type: 'string' },
        },
      },
      ACOSwarmExecuteRequest: {
        type: 'object',
        required: ['problemContext'],
        properties: {
          problemContext: { type: 'object' },
        },
      },
      ACOConfigUpdateRequest: {
        type: 'object',
        required: ['service', 'config'],
        properties: {
          service: { type: 'string' },
          config: { type: 'object' },
        },
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Authentication required' },
              },
            },
          },
        },
      },
      ForbiddenError: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Insufficient permissions' },
              },
            },
          },
        },
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation failed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ValidationError',
            },
          },
        },
      },
      InternalServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiError',
            },
          },
        },
      },
    },
  },
  paths: {
    // ════════════════════════════════════════════════
    // Health Endpoints
    // ════════════════════════════════════════════════
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Comprehensive health check',
        description: 'Returns full dependency status, memory usage, and uptime for monitoring dashboards',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Health check completed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthCheckResponse' } } },
          },
        },
      },
    },
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Kubernetes liveness probe - confirms process is running (always returns 200)',
        operationId: 'healthLiveness',
        responses: {
          '200': {
            description: 'Process is alive',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LivenessResponse' } } },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Kubernetes readiness probe - returns 200 if all dependencies are healthy, 503 otherwise',
        operationId: 'healthReadiness',
        responses: {
          '200': {
            description: 'Service is ready',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadinessResponse' } } },
          },
          '503': { description: 'Service not ready - dependencies unhealthy' },
        },
      },
    },

    // ════════════════════════════════════════════════
    // Auth Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        description: 'Creates a new user account with the specified username, email, and password',
        operationId: 'authRegister',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
        },
        responses: {
          '201': {
            description: 'User registered successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          '409': { description: 'User already exists' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User login',
        description: 'Authenticates a user and returns a JWT token for subsequent API calls',
        operationId: 'authLogin',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/v1/auth/profile': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user profile',
        description: 'Returns the profile of the currently authenticated user',
        operationId: 'getProfile',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'User profile retrieved',
            content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/UserProfile' } } } } },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      put: {
        tags: ['Authentication'],
        summary: 'Update user profile',
        description: 'Updates the profile of the currently authenticated user',
        operationId: 'updateProfile',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileRequest' } } },
        },
        responses: {
          '200': { description: 'Profile updated successfully' },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/auth/assign-role/{userId}': {
      put: {
        tags: ['Authentication'],
        summary: 'Assign role to user (Admin only)',
        description: 'Assigns a role to a user. Requires admin permissions.',
        operationId: 'assignRole',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' }, description: 'User ID' },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AssignRoleRequest' } } },
        },
        responses: {
          '200': { description: 'Role assigned successfully' },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '403': { $ref: '#/components/responses/ForbiddenError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/auth/users': {
      get: {
        tags: ['Authentication'],
        summary: 'Get all users (Admin only)',
        description: 'Returns a paginated list of all users. Requires admin permissions.',
        operationId: 'getUsers',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['student', 'educator', 'admin'] } },
        ],
        responses: {
          '200': {
            description: 'Users retrieved',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedUsersResponse' } } },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '403': { $ref: '#/components/responses/ForbiddenError' },
        },
      },
    },
    '/api/v1/auth/users/{userId}': {
      delete: {
        tags: ['Authentication'],
        summary: 'Delete user (Admin only)',
        description: 'Deletes a user account. Requires admin permissions.',
        operationId: 'deleteUser',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'User deleted successfully' },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '403': { $ref: '#/components/responses/ForbiddenError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // ════════════════════════════════════════════════
    // User Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/users/profile/{address}': {
      get: {
        tags: ['Users'],
        summary: 'Get user profile by Stellar address',
        operationId: 'getUserProfile',
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' }, description: 'Stellar wallet address' },
        ],
        responses: {
          '200': { description: 'User profile retrieved' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      put: {
        tags: ['Users'],
        summary: 'Update user profile by Stellar address',
        operationId: 'updateUserProfile',
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileRequest' } } },
        },
        responses: {
          '200': { description: 'Profile updated' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/users/settings/{userId}': {
      get: {
        tags: ['Users'],
        summary: 'Get user settings',
        operationId: 'getUserSettings',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'User settings retrieved' } },
      },
      put: {
        tags: ['Users'],
        summary: 'Update user settings',
        operationId: 'updateUserSettings',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/api/v1/users/profile/{address}/achievements': {
      get: {
        tags: ['Users'],
        summary: 'Get user achievements',
        operationId: 'getUserAchievements',
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Achievements retrieved' } },
      },
    },
    '/api/v1/users/profile/{address}/stats': {
      get: {
        tags: ['Users'],
        summary: 'Get user statistics',
        operationId: 'getUserStats',
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Stats retrieved' } },
      },
    },

    // ════════════════════════════════════════════════
    // Content Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/content/upload': {
      post: {
        tags: ['Content'],
        summary: 'Upload a single file to IPFS',
        operationId: 'uploadContent',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary', description: 'File to upload' },
                  metadata: { type: 'string', description: 'JSON metadata' },
                  wrapWithDirectory: { type: 'string', enum: ['true', 'false'] },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'File uploaded successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentUploadResponse' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/content/upload/batch': {
      post: {
        tags: ['Content'],
        summary: 'Upload multiple files to IPFS',
        operationId: 'uploadContentBatch',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 10 },
                  metadata: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Batch upload completed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchUploadResponse' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/content/{cid}': {
      get: {
        tags: ['Content'],
        summary: 'Retrieve content from IPFS by CID',
        operationId: 'getContent',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'cid', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['buffer', 'base64', 'stream'], default: 'buffer' } },
        ],
        responses: {
          '200': { description: 'Content retrieved' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/content/{cid}/metadata': {
      get: {
        tags: ['Content'],
        summary: 'Get content metadata',
        operationId: 'getContentMetadata',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'cid', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'metadataCid', in: 'query', schema: { type: 'string' }, description: 'Metadata CID' },
        ],
        responses: { '200': { description: 'Metadata retrieved' } },
      },
    },
    '/api/v1/content/{cid}/pin': {
      post: {
        tags: ['Content'],
        summary: 'Pin content to IPFS',
        operationId: 'pinContent',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'cid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Content pinned' } },
      },
      delete: {
        tags: ['Content'],
        summary: 'Unpin content from IPFS',
        operationId: 'unpinContent',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'cid', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Content unpinned' } },
      },
    },
    '/api/v1/content/node/info': {
      get: {
        tags: ['Content'],
        summary: 'Get IPFS node information',
        operationId: 'getIPFSNodeInfo',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Node info retrieved' } },
      },
    },
    '/api/v1/content/cache/stats': {
      get: {
        tags: ['Content'],
        summary: 'Get cache statistics',
        operationId: 'getCacheStats',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Cache stats retrieved' } },
      },
    },
    '/api/v1/content/cache': {
      delete: {
        tags: ['Content'],
        summary: 'Clear IPFS cache',
        operationId: 'clearCache',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Cache cleared' } },
      },
    },
    '/api/v1/content/health': {
      get: {
        tags: ['Content'],
        summary: 'IPFS service health check',
        operationId: 'contentHealthCheck',
        responses: { '200': { description: 'Health status' } },
      },
    },

    // ════════════════════════════════════════════════
    // Course / Version Control Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/courses/{contentId}/versions': {
      post: {
        tags: ['Courses'],
        summary: 'Create a new version for course content',
        operationId: 'createVersion',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateVersionRequest' } } },
        },
        responses: {
          '201': {
            description: 'Version created',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/ContentVersion' } } } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
      get: {
        tags: ['Courses'],
        summary: 'Get version history for course content',
        operationId: 'getVersionHistory',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: {
          '200': {
            description: 'Version history retrieved',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/VersionHistoryResponse' } } },
          },
        },
      },
    },
    '/api/v1/courses/{contentId}/versions/current': {
      get: {
        tags: ['Courses'],
        summary: 'Get current version of course content',
        operationId: 'getCurrentVersion',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Current version retrieved' },
        },
      },
    },
    '/api/v1/courses/{contentId}/versions/{versionNumber}': {
      get: {
        tags: ['Courses'],
        summary: 'Get specific version by version number',
        operationId: 'getVersionByNumber',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'versionNumber', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
        ],
        responses: {
          '200': { description: 'Version retrieved' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/courses/versions/compare/{version1Id}/{version2Id}': {
      post: {
        tags: ['Courses'],
        summary: 'Compare two versions',
        operationId: 'compareVersions',
        parameters: [
          { name: 'version1Id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'version2Id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Versions compared',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/VersionComparisonResponse' } } },
          },
        },
      },
    },
    '/api/v1/courses/{contentId}/versions/restore': {
      post: {
        tags: ['Courses'],
        summary: 'Restore content to a specific version',
        operationId: 'restoreVersion',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['versionId', 'restoredBy'],
                properties: {
                  versionId: { type: 'string' },
                  restoreReason: { type: 'string' },
                  restoredBy: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Content restored' } },
      },
    },
    '/api/v1/courses/{contentId}/versions/settings': {
      put: {
        tags: ['Courses'],
        summary: 'Update version control settings',
        operationId: 'updateVersionSettings',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  autoVersioning: { type: 'boolean' },
                  maxVersions: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/api/v1/courses/{contentId}/versions/export': {
      get: {
        tags: ['Courses'],
        summary: 'Export version history',
        operationId: 'exportVersions',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'], default: 'json' } },
        ],
        responses: { '200': { description: 'Exported version history file' } },
      },
    },
    '/api/v1/courses/{contentId}/versions/statistics': {
      get: {
        tags: ['Courses'],
        summary: 'Get version statistics',
        operationId: 'getVersionStatistics',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Version statistics retrieved' } },
      },
    },

    // ════════════════════════════════════════════════
    // Quiz Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/quizzes': {
      post: {
        tags: ['Quizzes'],
        summary: 'Create a new quiz',
        operationId: 'createQuiz',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '201': { description: 'Quiz created' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
      get: {
        tags: ['Quizzes'],
        summary: 'Get all quizzes',
        operationId: 'getQuizzes',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Quizzes retrieved' },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
    },
    '/api/v1/quizzes/{id}': {
      get: {
        tags: ['Quizzes'],
        summary: 'Get quiz by ID',
        operationId: 'getQuizById',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Quiz retrieved' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
      put: {
        tags: ['Quizzes'],
        summary: 'Update quiz',
        operationId: 'updateQuiz',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Quiz updated' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
      delete: {
        tags: ['Quizzes'],
        summary: 'Delete quiz',
        operationId: 'deleteQuiz',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Quiz deleted' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/quizzes/{id}/publish': {
      post: {
        tags: ['Quizzes'],
        summary: 'Toggle quiz publish status',
        operationId: 'toggleQuizPublish',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Publish status toggled' } },
      },
    },
    '/api/v1/quizzes/{id}/submit': {
      post: {
        tags: ['Quizzes'],
        summary: 'Submit quiz answers',
        operationId: 'submitQuiz',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/QuizSubmission' } } },
        },
        responses: {
          '200': { description: 'Quiz submitted' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/quizzes/{id}/submission': {
      get: {
        tags: ['Quizzes'],
        summary: 'Get user submission for quiz',
        operationId: 'getUserSubmission',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Submission retrieved' } },
      },
    },
    '/api/v1/quizzes/{id}/results': {
      get: {
        tags: ['Quizzes'],
        summary: 'Get quiz results',
        operationId: 'getQuizResults',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Results retrieved' } },
      },
    },
    '/api/v1/quizzes/{id}/statistics': {
      get: {
        tags: ['Quizzes'],
        summary: 'Get quiz statistics',
        operationId: 'getQuizStatistics',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Statistics retrieved' } },
      },
    },
    '/api/v1/quizzes/{id}/grading-statistics': {
      get: {
        tags: ['Quizzes'],
        summary: 'Get grading statistics',
        operationId: 'getGradingStatistics',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Grading statistics retrieved' } },
      },
    },
    '/api/v1/quizzes/submissions/{submissionId}': {
      get: {
        tags: ['Quizzes'],
        summary: 'Get submission by ID',
        operationId: 'getSubmissionById',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Submission retrieved' } },
      },
    },
    '/api/v1/quizzes/submissions/{submissionId}/regrade': {
      post: {
        tags: ['Quizzes'],
        summary: 'Regrade a submission',
        operationId: 'regradeSubmission',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Submission regraded' } },
      },
    },
    '/api/v1/quizzes/health': {
      get: {
        tags: ['Quizzes'],
        summary: 'Quiz service health check',
        operationId: 'quizHealthCheck',
        responses: { '200': { description: 'Health status' } },
      },
    },

    // ════════════════════════════════════════════════
    // Enrollment Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/enrollments': {
      get: {
        tags: ['Enrollments'],
        summary: "Get user's enrollments",
        operationId: 'getUserEnrollments',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Enrollments retrieved' } },
      },
      post: {
        tags: ['Enrollments'],
        summary: 'Create new enrollment (enroll in course)',
        operationId: 'createEnrollment',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateEnrollmentRequest' } } },
        },
        responses: {
          '201': { description: 'Enrollment created' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/enrollments/{id}': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get specific enrollment details',
        operationId: 'getEnrollmentById',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Enrollment details' } },
      },
      put: {
        tags: ['Enrollments'],
        summary: 'Update enrollment details',
        operationId: 'updateEnrollment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Enrollment updated' } },
      },
      delete: {
        tags: ['Enrollments'],
        summary: 'Cancel enrollment',
        operationId: 'cancelEnrollment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Enrollment cancelled' } },
      },
    },
    '/api/v1/enrollments/{id}/complete': {
      post: {
        tags: ['Enrollments'],
        summary: 'Mark enrollment as completed',
        operationId: 'completeEnrollment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Enrollment completed' } },
      },
    },
    '/api/v1/enrollments/{id}/progress': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get enrollment progress',
        operationId: 'getEnrollmentProgress',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Progress retrieved' } },
      },
      put: {
        tags: ['Enrollments'],
        summary: 'Update enrollment progress',
        operationId: 'updateEnrollmentProgress',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Progress updated' } },
      },
    },
    '/api/v1/enrollments/course/{courseId}': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get all enrollments for a course',
        operationId: 'getCourseEnrollments',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Course enrollments' } },
      },
    },
    '/api/v1/enrollments/{id}/certificate': {
      post: {
        tags: ['Enrollments'],
        summary: 'Issue certificate for completed enrollment',
        operationId: 'issueCertificate',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Certificate issued' } },
      },
    },
    '/api/v1/enrollments/capacity/{courseId}': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get course capacity information',
        operationId: 'getCourseCapacity',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Capacity info' } },
      },
    },
    '/api/v1/enrollments/validate-prerequisites': {
      post: {
        tags: ['Enrollments'],
        summary: 'Validate course prerequisites',
        operationId: 'validatePrerequisites',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Prerequisites validated' } },
      },
    },
    '/api/v1/enrollments/history/{userId}': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get user enrollment history',
        operationId: 'getEnrollmentHistory',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'History retrieved' } },
      },
    },
    '/api/v1/enrollments/{id}/renew': {
      post: {
        tags: ['Enrollments'],
        summary: 'Renew expired enrollment',
        operationId: 'renewEnrollment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Enrollment renewed' } },
      },
    },
    '/api/v1/enrollments/export/{courseId}': {
      get: {
        tags: ['Enrollments'],
        summary: 'Export course enrollments',
        operationId: 'exportCourseEnrollments',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Exported enrollments' } },
      },
    },
    '/api/v1/enrollments/analytics/user': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get user enrollment analytics',
        operationId: 'getUserEnrollmentAnalytics',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Analytics retrieved' } },
      },
    },
    '/api/v1/enrollments/analytics/course/{courseId}': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get course enrollment analytics',
        operationId: 'getCourseEnrollmentAnalytics',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Analytics retrieved' } },
      },
    },
    '/api/v1/enrollments/analytics/global': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get global enrollment analytics',
        operationId: 'getGlobalEnrollmentAnalytics',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Global analytics retrieved' } },
      },
    },
    '/api/v1/enrollments/bulk': {
      post: {
        tags: ['Enrollments'],
        summary: 'Bulk enrollment operations',
        operationId: 'bulkEnrollment',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Bulk operation completed' } },
      },
    },
    '/api/v1/enrollments/waitlist/{courseId}': {
      get: {
        tags: ['Enrollments'],
        summary: 'Get waitlist for a course',
        operationId: 'getCourseWaitlist',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Waitlist retrieved' } },
      },
      post: {
        tags: ['Enrollments'],
        summary: 'Add to course waitlist',
        operationId: 'addToWaitlist',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Added to waitlist' } },
      },
      delete: {
        tags: ['Enrollments'],
        summary: 'Remove from course waitlist',
        operationId: 'removeFromWaitlist',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Removed from waitlist' } },
      },
    },

    // ════════════════════════════════════════════════
    // Payment Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/payments/intent': {
      post: {
        tags: ['Payments'],
        summary: 'Create payment intent',
        operationId: 'createPaymentIntent',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '200': { description: 'Payment intent created' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/payments/stellar/create': {
      post: {
        tags: ['Payments'],
        summary: 'Create Stellar payment transaction',
        operationId: 'createStellarPayment',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StellarPaymentRequest' } } },
        },
        responses: { '200': { description: 'Stellar payment created' } },
      },
    },
    '/api/v1/payments/stellar/submit': {
      post: {
        tags: ['Payments'],
        summary: 'Submit Stellar payment transaction',
        operationId: 'submitStellarPayment',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Stellar payment submitted' } },
      },
    },
    '/api/v1/payments/{id}': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment details',
        operationId: 'getPaymentById',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Payment details' } },
      },
    },
    '/api/v1/payments/enrollment/{enrollmentId}': {
      get: {
        tags: ['Payments'],
        summary: 'Get payments for an enrollment',
        operationId: 'getEnrollmentPayments',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'enrollmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Payments retrieved' } },
      },
    },
    '/api/v1/payments/history': {
      get: {
        tags: ['Payments'],
        summary: 'Get user payment history',
        operationId: 'getPaymentHistory',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Payment history' } },
      },
    },
    '/api/v1/payments/{id}/refund': {
      post: {
        tags: ['Payments'],
        summary: 'Process payment refund',
        operationId: 'processRefund',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Refund processed' } },
      },
    },
    '/api/v1/payments/receipt/{paymentId}': {
      get: {
        tags: ['Payments'],
        summary: 'Generate payment receipt',
        operationId: 'generateReceipt',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Receipt generated' } },
      },
    },
    '/api/v1/payments/settings': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment settings',
        operationId: 'getPaymentSettings',
        responses: { '200': { description: 'Settings retrieved' } },
      },
      put: {
        tags: ['Payments'],
        summary: 'Update payment settings (Admin only)',
        operationId: 'updatePaymentSettings',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/api/v1/payments/methods': {
      get: {
        tags: ['Payments'],
        summary: 'Get supported payment methods',
        operationId: 'getPaymentMethods',
        responses: { '200': { description: 'Payment methods' } },
      },
    },
    '/api/v1/payments/validate': {
      post: {
        tags: ['Payments'],
        summary: 'Validate payment parameters',
        operationId: 'validatePayment',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Payment parameters validated' } },
      },
    },
    '/api/v1/payments/analytics': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment analytics (Admin only)',
        operationId: 'getPaymentAnalytics',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Analytics retrieved' } },
      },
    },
    '/api/v1/payments/exchange-rates': {
      get: {
        tags: ['Payments'],
        summary: 'Get exchange rates',
        operationId: 'getExchangeRates',
        responses: { '200': { description: 'Exchange rates' } },
      },
    },
    '/api/v1/payments/convert': {
      post: {
        tags: ['Payments'],
        summary: 'Convert currency amount',
        operationId: 'convertCurrency',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Conversion completed' } },
      },
    },
    '/api/v1/payments/stellar/balance/{address}': {
      get: {
        tags: ['Payments'],
        summary: 'Get Stellar account balance',
        operationId: 'getStellarBalance',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Balance retrieved' } },
      },
    },
    '/api/v1/payments/stellar/transactions/{address}': {
      get: {
        tags: ['Payments'],
        summary: 'Get Stellar transaction history',
        operationId: 'getStellarTransactions',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Transaction history' } },
      },
    },
    '/api/v1/payments/webhook/stellar': {
      post: {
        tags: ['Payments'],
        summary: 'Handle Stellar webhook',
        operationId: 'handleStellarWebhook',
        responses: { '200': { description: 'Webhook handled' } },
      },
    },
    '/api/v1/payments/webhook/payment-gateway': {
      post: {
        tags: ['Payments'],
        summary: 'Handle payment gateway webhook',
        operationId: 'handlePaymentGatewayWebhook',
        responses: { '200': { description: 'Webhook handled' } },
      },
    },

    // ════════════════════════════════════════════════
    // Search Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/search': {
      get: {
        tags: ['Search'],
        summary: 'Execute search query',
        operationId: 'executeSearch',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
          { name: 'query', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'sessionId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Search results' },
        },
      },
    },
    '/api/v1/search/suggestions': {
      get: {
        tags: ['Search'],
        summary: 'Get search suggestions',
        operationId: 'getSearchSuggestions',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 6 } },
        ],
        responses: { '200': { description: 'Suggestions' } },
      },
    },
    '/api/v1/search/voice': {
      post: {
        tags: ['Search'],
        summary: 'Voice search',
        operationId: 'voiceSearch',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VoiceSearchRequest' } } },
        },
        responses: { '200': { description: 'Voice search processed' } },
      },
    },
    '/api/v1/search/recommendations': {
      get: {
        tags: ['Search'],
        summary: 'Get personalized recommendations',
        operationId: 'getRecommendations',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 6 } },
        ],
        responses: { '200': { description: 'Recommendations' } },
      },
    },
    '/api/v1/search/trending': {
      get: {
        tags: ['Search'],
        summary: 'Get trending content',
        operationId: 'getTrending',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 6 } },
        ],
        responses: { '200': { description: 'Trending content' } },
      },
    },
    '/api/v1/search/similar/{courseId}': {
      get: {
        tags: ['Search'],
        summary: 'Get similar courses',
        operationId: 'getSimilarCourses',
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 4 } },
        ],
        responses: { '200': { description: 'Similar courses' } },
      },
    },
    '/api/v1/search/learning-paths': {
      get: {
        tags: ['Search'],
        summary: 'Get learning paths',
        operationId: 'getLearningPaths',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 4 } },
        ],
        responses: { '200': { description: 'Learning paths' } },
      },
    },
    '/api/v1/search/curators': {
      get: {
        tags: ['Search'],
        summary: 'Get curator recommendations',
        operationId: 'getCuratorPicks',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 3 } },
        ],
        responses: { '200': { description: 'Curator picks' } },
      },
    },
    '/api/v1/search/history': {
      get: {
        tags: ['Search'],
        summary: 'Get search history',
        operationId: 'getSearchHistory',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'sessionId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Search history' } },
      },
    },
    '/api/v1/search/saved-searches': {
      get: {
        tags: ['Search'],
        summary: 'Get saved searches',
        operationId: 'getSavedSearches',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Saved searches' } },
      },
      post: {
        tags: ['Search'],
        summary: 'Save a search',
        operationId: 'saveSearch',
        responses: {
          '201': { description: 'Search saved' },
        },
      },
    },
    '/api/v1/search/alerts': {
      get: {
        tags: ['Search'],
        summary: 'Get search alerts',
        operationId: 'getSearchAlerts',
        responses: { '200': { description: 'Alerts' } },
      },
      post: {
        tags: ['Search'],
        summary: 'Create search alert',
        operationId: 'createSearchAlert',
        responses: {
          '201': { description: 'Alert created' },
        },
      },
    },
    '/api/v1/search/click': {
      post: {
        tags: ['Search'],
        summary: 'Record search click',
        operationId: 'recordSearchClick',
        responses: {
          '201': { description: 'Click recorded' },
        },
      },
    },
    '/api/v1/search/analytics': {
      get: {
        tags: ['Search'],
        summary: 'Get search analytics',
        operationId: 'getSearchAnalytics',
        responses: { '200': { description: 'Search analytics' } },
      },
    },

    // ════════════════════════════════════════════════
    // Notification Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/notifications/{userId}': {
      get: {
        tags: ['Notifications'],
        summary: 'Get user notifications',
        operationId: 'getNotifications',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Notifications retrieved' } },
      },
    },
    '/api/v1/notifications/{notificationId}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark notification as read',
        operationId: 'markAsRead',
        parameters: [
          { name: 'notificationId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Marked as read' } },
      },
    },
    '/api/v1/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        operationId: 'markAllAsRead',
        responses: { '200': { description: 'All marked as read' } },
      },
    },
    '/api/v1/notifications/{userId}/preferences': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notification preferences',
        operationId: 'getNotificationPreferences',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Preferences retrieved' } },
      },
      put: {
        tags: ['Notifications'],
        summary: 'Update notification preferences',
        operationId: 'updateNotificationPreferences',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationPreferences' } } },
        },
        responses: { '200': { description: 'Preferences updated' } },
      },
    },
    '/api/v1/notifications/{notificationId}': {
      delete: {
        tags: ['Notifications'],
        summary: 'Delete notification',
        operationId: 'deleteNotification',
        parameters: [
          { name: 'notificationId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Notification deleted' } },
      },
    },

    // ════════════════════════════════════════════════
    // Sync Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/sync/devices/register': {
      post: {
        tags: ['Sync'],
        summary: 'Register a device',
        operationId: 'registerDevice',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceRegistration' } } },
        },
        responses: {
          '201': { description: 'Device registered' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/sync/devices/heartbeat': {
      post: {
        tags: ['Sync'],
        summary: 'Send device heartbeat',
        operationId: 'deviceHeartbeat',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: { '200': { description: 'Heartbeat received' } },
      },
    },
    '/api/v1/sync/devices/{deviceId}': {
      delete: {
        tags: ['Sync'],
        summary: 'Unregister a device',
        operationId: 'unregisterDevice',
        parameters: [
          { name: 'deviceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Device unregistered' } },
      },
    },
    '/api/v1/sync/users/{userId}/devices': {
      get: {
        tags: ['Sync'],
        summary: "Get user's devices",
        operationId: 'getUserDevices',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Devices retrieved' } },
      },
    },
    '/api/v1/sync/users/{userId}/status': {
      get: {
        tags: ['Sync'],
        summary: 'Get sync status for user',
        operationId: 'getSyncStatus',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Sync status' } },
      },
    },
    '/api/v1/sync/sync': {
      post: {
        tags: ['Sync'],
        summary: 'Sync an entity change',
        operationId: 'syncEntity',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SyncEntity' } } },
        },
        responses: { '200': { description: 'Entity synced' } },
      },
    },
    '/api/v1/sync/queue': {
      post: {
        tags: ['Sync'],
        summary: 'Enqueue sync operation',
        operationId: 'enqueueSync',
        responses: {
          '201': { description: 'Enqueued' },
        },
      },
    },
    '/api/v1/sync/queue/process': {
      post: {
        tags: ['Sync'],
        summary: 'Process offline queue',
        operationId: 'processQueue',
        responses: { '200': { description: 'Queue processed' } },
      },
    },
    '/api/v1/sync/queue/status': {
      get: {
        tags: ['Sync'],
        summary: 'Get queue status',
        operationId: 'getQueueStatus',
        responses: { '200': { description: 'Queue status' } },
      },
    },

    // ════════════════════════════════════════════════
    // Event Logger Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/events/course-completion': {
      post: {
        tags: ['Events'],
        summary: 'Log course completion event',
        operationId: 'logCourseCompletion',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LogCourseCompletionRequest' } } },
        },
        responses: { '201': { description: 'Event logged' } },
      },
    },
    '/api/v1/events/credential-issuance': {
      post: {
        tags: ['Events'],
        summary: 'Log credential issuance event',
        operationId: 'logCredentialIssuance',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LogCredentialIssuanceRequest' } } },
        },
        responses: { '201': { description: 'Event logged' } },
      },
    },
    '/api/v1/events/user-achievement': {
      post: {
        tags: ['Events'],
        summary: 'Log user achievement event',
        operationId: 'logUserAchievement',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LogUserAchievementRequest' } } },
        },
        responses: { '201': { description: 'Event logged' } },
      },
    },
    '/api/v1/events/profile-update': {
      post: {
        tags: ['Events'],
        summary: 'Log profile update event',
        operationId: 'logProfileUpdate',
        responses: { '201': { description: 'Event logged' } },
      },
    },
    '/api/v1/events/course-enrollment': {
      post: {
        tags: ['Events'],
        summary: 'Log course enrollment event',
        operationId: 'logCourseEnrollment',
        responses: { '201': { description: 'Event logged' } },
      },
    },
    '/api/v1/events/event/{eventId}': {
      get: {
        tags: ['Events'],
        summary: 'Get event by ID',
        operationId: 'getEventById',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Event retrieved' } },
      },
    },
    '/api/v1/events/user/{userId}/events': {
      get: {
        tags: ['Events'],
        summary: "Get user's events",
        operationId: 'getUserEvents',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Events retrieved' } },
      },
    },
    '/api/v1/events/type/{eventType}': {
      get: {
        tags: ['Events'],
        summary: 'Get events by type',
        operationId: 'getEventsByType',
        parameters: [
          { name: 'eventType', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Events retrieved' } },
      },
    },
    '/api/v1/events/recent': {
      get: {
        tags: ['Events'],
        summary: 'Get recent events',
        operationId: 'getRecentEvents',
        responses: { '200': { description: 'Recent events' } },
      },
    },
    '/api/v1/events/count': {
      get: {
        tags: ['Events'],
        summary: 'Get event count',
        operationId: 'getEventCount',
        responses: { '200': { description: 'Event count' } },
      },
    },
    '/api/v1/events/search': {
      get: {
        tags: ['Events'],
        summary: 'Search events',
        operationId: 'searchEvents',
        responses: { '200': { description: 'Search results' } },
      },
    },
    '/api/v1/events/verify/{eventId}': {
      get: {
        tags: ['Events'],
        summary: 'Verify event integrity',
        operationId: 'verifyEvent',
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Verification result' } },
      },
    },
    '/api/v1/events/audit-report/{userId}': {
      get: {
        tags: ['Events'],
        summary: 'Generate user audit report',
        operationId: 'generateAuditReport',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Audit report' } },
      },
    },

    // ════════════════════════════════════════════════
    // Collaboration Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/collaboration/rooms': {
      post: {
        tags: ['Collaboration'],
        summary: 'Create a collaboration room',
        operationId: 'createRoom',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateRoomRequest' } } },
        },
        responses: {
          '201': { description: 'Room created' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
      get: {
        tags: ['Collaboration'],
        summary: 'List collaboration rooms',
        operationId: 'listRooms',
        responses: { '200': { description: 'Rooms listed' } },
      },
    },
    '/api/v1/collaboration/rooms/{roomId}': {
      get: {
        tags: ['Collaboration'],
        summary: 'Get room by ID',
        operationId: 'getRoomById',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Room details' } },
      },
    },
    '/api/v1/collaboration/rooms/{roomId}/end': {
      post: {
        tags: ['Collaboration'],
        summary: 'End a collaboration room',
        operationId: 'endRoom',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Room ended' } },
      },
    },

    // ════════════════════════════════════════════════
    // Smart Wallet Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/smart-wallet/create': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Create a new smart contract wallet',
        operationId: 'createSmartWallet',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateWalletRequest' } } },
        },
        responses: {
          '201': { description: 'Wallet created' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/smart-wallet/execute': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Execute a transaction through smart wallet',
        operationId: 'executeTransaction',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ExecuteTransactionRequest' } } },
        },
        responses: { '200': { description: 'Transaction executed' } },
      },
    },
    '/api/v1/smart-wallet/execute-batch': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Execute batch transactions',
        operationId: 'executeBatchTransactions',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Batch executed' } },
      },
    },
    '/api/v1/smart-wallet/recovery/setup': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Setup social recovery',
        operationId: 'setupSocialRecovery',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SetupSocialRecoveryRequest' } } },
        },
        responses: { '200': { description: 'Recovery setup' } },
      },
    },
    '/api/v1/smart-wallet/recovery/initiate': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Initiate wallet recovery',
        operationId: 'initiateRecovery',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InitiateRecoveryRequest' } } },
        },
        responses: { '200': { description: 'Recovery initiated' } },
      },
    },
    '/api/v1/smart-wallet/recovery/support': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Support a recovery request',
        operationId: 'supportRecovery',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Recovery supported' } },
      },
    },
    '/api/v1/smart-wallet/recovery/{recoveryId}': {
      get: {
        tags: ['Smart Wallet'],
        summary: 'Get recovery request details',
        operationId: 'getRecoveryRequest',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'recoveryId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Recovery details' } },
      },
    },
    '/api/v1/smart-wallet/multisig/setup': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Setup multi-signature',
        operationId: 'setupMultiSig',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SetupMultiSigRequest' } } },
        },
        responses: { '200': { description: 'Multi-sig setup' } },
      },
    },
    '/api/v1/smart-wallet/multisig/propose': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Propose a multi-sig transaction',
        operationId: 'proposeMultiSigTransaction',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Transaction proposed' } },
      },
    },
    '/api/v1/smart-wallet/multisig/pending/{walletAddress}': {
      get: {
        tags: ['Smart Wallet'],
        summary: 'Get pending multi-sig transactions',
        operationId: 'getPendingMultiSigTransactions',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'walletAddress', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Pending transactions' } },
      },
    },
    '/api/v1/smart-wallet/session-key/create': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Create a session key',
        operationId: 'createSessionKey',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSessionKeyRequest' } } },
        },
        responses: { '200': { description: 'Session key created' } },
      },
    },
    '/api/v1/smart-wallet/session-key/active/{walletAddress}': {
      get: {
        tags: ['Smart Wallet'],
        summary: 'Get active session keys',
        operationId: 'getActiveSessionKeys',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'walletAddress', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Active session keys' } },
      },
    },
    '/api/v1/smart-wallet/activity/{walletAddress}': {
      get: {
        tags: ['Smart Wallet'],
        summary: 'Get wallet activity',
        operationId: 'getWalletActivity',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'walletAddress', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Wallet activity' } },
      },
    },
    '/api/v1/smart-wallet/alerts/{walletAddress}': {
      get: {
        tags: ['Smart Wallet'],
        summary: 'Get wallet activity alerts',
        operationId: 'getWalletAlerts',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'walletAddress', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Alerts retrieved' } },
      },
    },
    '/api/v1/smart-wallet/credentials/stats': {
      get: {
        tags: ['Smart Wallet'],
        summary: 'Get credential renewal statistics',
        operationId: 'getCredentialRenewalStats',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Stats retrieved' } },
      },
    },
    '/api/v1/smart-wallet/credentials/auto-renewal': {
      post: {
        tags: ['Smart Wallet'],
        summary: 'Enable auto-renewal for credential',
        operationId: 'enableAutoRenewal',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Auto-renewal enabled' } },
      },
    },

    // ════════════════════════════════════════════════
    // Federated Learning Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/federated-learning/sessions': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Initialize federated learning session',
        operationId: 'createFederatedSession',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FederatedSessionRequest' } } },
        },
        responses: {
          '201': { description: 'Session created' },
        },
      },
    },
    '/api/v1/federated-learning/sessions/{sessionId}/status': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Get federated learning session status',
        operationId: 'getFederatedSessionStatus',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Session status' } },
      },
    },
    '/api/v1/federated-learning/participants': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Register as participant',
        operationId: 'registerParticipant',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterParticipantRequest' } } },
        },
        responses: { '200': { description: 'Participant registered' } },
      },
      get: {
        tags: ['Federated Learning'],
        summary: 'Get participants',
        operationId: 'getParticipants',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Participants list' } },
      },
    },
    '/api/v1/federated-learning/rounds': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Start a federated learning round',
        operationId: 'startFederatedRound',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Round started' } },
      },
    },
    '/api/v1/federated-learning/participants/{participantId}/updates': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Submit model update',
        operationId: 'submitModelUpdate',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'participantId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitModelUpdateRequest' } } },
        },
        responses: { '200': { description: 'Update submitted' } },
      },
    },
    '/api/v1/federated-learning/rounds/history': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Get round history',
        operationId: 'getRoundHistory',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Round history' } },
      },
    },
    '/api/v1/federated-learning/models/versions': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Get model versions',
        operationId: 'getModelVersions',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Model versions' } },
      },
    },
    '/api/v1/federated-learning/models/rollback/{versionId}': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Rollback model to version',
        operationId: 'rollbackModel',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'versionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Model rolled back' } },
      },
    },
    '/api/v1/federated-learning/models/compare': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Compare models',
        operationId: 'compareModels',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Model comparison' } },
      },
    },
    '/api/v1/federated-learning/analytics': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Get federated learning analytics',
        operationId: 'getFederatedAnalytics',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Analytics' } },
      },
    },
    '/api/v1/federated-learning/analytics/export': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Export federated learning analytics',
        operationId: 'exportFederatedAnalytics',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Exported analytics' } },
      },
    },
    '/api/v1/federated-learning/privacy/status': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Get privacy status',
        operationId: 'getPrivacyStatus',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Privacy status' } },
      },
    },
    '/api/v1/federated-learning/privacy/reset-budget': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Reset privacy budget',
        operationId: 'resetPrivacyBudget',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Budget reset' } },
      },
    },
    '/api/v1/federated-learning/validation/validate': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Validate a model',
        operationId: 'validateFederatedModel',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Model validated' } },
      },
    },
    '/api/v1/federated-learning/validation/stats': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Get validation stats',
        operationId: 'getFederatedValidationStats',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Validation stats' } },
      },
    },
    '/api/v1/federated-learning/health': {
      get: {
        tags: ['Federated Learning'],
        summary: 'Federated learning system health',
        operationId: 'federatedHealth',
        responses: { '200': { description: 'Health status' } },
      },
    },
    '/api/v1/federated-learning/shutdown': {
      post: {
        tags: ['Federated Learning'],
        summary: 'Shutdown federated learning system',
        operationId: 'shutdownFederated',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'System shutdown' } },
      },
    },

    // ════════════════════════════════════════════════
    // Swarm Learning Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/swarm-learning/initialize': {
      post: {
        tags: ['Swarm Learning'],
        summary: 'Initialize swarm learning system',
        operationId: 'initializeSwarm',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InitializeSwarmRequest' } } },
        },
        responses: { '200': { description: 'System initialized' } },
      },
    },
    '/api/v1/swarm-learning/shutdown': {
      post: {
        tags: ['Swarm Learning'],
        summary: 'Shutdown swarm learning system',
        operationId: 'shutdownSwarm',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'System shutdown' } },
      },
    },
    '/api/v1/swarm-learning/swarms': {
      post: {
        tags: ['Swarm Learning'],
        summary: 'Create a new swarm',
        operationId: 'createSwarm',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSwarmRequest' } } },
        },
        responses: {
          '201': { description: 'Swarm created' },
        },
      },
    },
    '/api/v1/swarm-learning/swarms/{taskId}/start': {
      post: {
        tags: ['Swarm Learning'],
        summary: 'Start swarm learning task',
        operationId: 'startSwarmTask',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Task started' } },
      },
    },
    '/api/v1/swarm-learning/swarms/status': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Get swarm status',
        operationId: 'getSwarmStatus',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Swarm status' } },
      },
    },
    '/api/v1/swarm-learning/agents': {
      post: {
        tags: ['Swarm Learning'],
        summary: 'Register an agent',
        operationId: 'registerSwarmAgent',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterAgentRequest' } } },
        },
        responses: { '200': { description: 'Agent registered' } },
      },
    },
    '/api/v1/swarm-learning/agents/{agentId}': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Get agent details',
        operationId: 'getSwarmAgent',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Agent details' } },
      },
    },
    '/api/v1/swarm-learning/tasks/{taskId}': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Get task details',
        operationId: 'getSwarmTask',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Task details' } },
      },
    },
    '/api/v1/swarm-learning/behaviors': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Get emergent behaviors',
        operationId: 'getEmergentBehaviors',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Behaviors' } },
      },
    },
    '/api/v1/swarm-learning/analytics': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Get swarm analytics',
        operationId: 'getSwarmAnalytics',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Analytics' } },
      },
    },
    '/api/v1/swarm-learning/analytics/report': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Get swarm analytics report',
        operationId: 'getSwarmReport',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Report' } },
      },
    },
    '/api/v1/swarm-learning/analytics/export': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Export swarm data',
        operationId: 'exportSwarmData',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Exported data' } },
      },
    },
    '/api/v1/swarm-learning/alerts': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Get swarm alerts',
        operationId: 'getSwarmAlerts',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Alerts' } },
      },
    },
    '/api/v1/swarm-learning/alerts/{alertId}/acknowledge': {
      post: {
        tags: ['Swarm Learning'],
        summary: 'Acknowledge swarm alert',
        operationId: 'acknowledgeSwarmAlert',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'alertId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Alert acknowledged' } },
      },
    },
    '/api/v1/swarm-learning/configuration': {
      put: {
        tags: ['Swarm Learning'],
        summary: 'Update swarm configuration',
        operationId: 'updateSwarmConfig',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Configuration updated' } },
      },
    },
    '/api/v1/swarm-learning/health': {
      get: {
        tags: ['Swarm Learning'],
        summary: 'Swarm learning health check',
        operationId: 'swarmHealth',
        responses: { '200': { description: 'Health status' } },
      },
    },

    // ════════════════════════════════════════════════
    // AGI Tutor Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/agi-tutor/session': {
      post: {
        tags: ['AGI Tutor'],
        summary: 'Generate personalized learning session',
        operationId: 'generateLearningSession',
        description: 'Creates an AI-powered personalized learning session for a student',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateSessionRequest' } } },
        },
        responses: {
          '200': { description: 'Session generated' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/v1/agi-tutor/response': {
      post: {
        tags: ['AGI Tutor'],
        summary: 'Process student response',
        operationId: 'processStudentResponse',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProcessResponseRequest' } } },
        },
        responses: {
          '200': { description: 'Response processed' },
        },
      },
    },
    '/api/v1/agi-tutor/assessment': {
      post: {
        tags: ['AGI Tutor'],
        summary: 'Generate comprehensive assessment',
        operationId: 'generateAssessment',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateAssessmentRequest' } } },
        },
        responses: {
          '200': { description: 'Assessment generated' },
        },
      },
    },
    '/api/v1/agi-tutor/guidance': {
      post: {
        tags: ['AGI Tutor'],
        summary: 'Get real-time teaching guidance',
        operationId: 'getTeachingGuidance',
        responses: { '200': { description: 'Guidance provided' } },
      },
    },
    '/api/v1/agi-tutor/visualization': {
      get: {
        tags: ['AGI Tutor'],
        summary: 'Get knowledge visualization',
        operationId: 'getKnowledgeVisualization',
        responses: { '200': { description: 'Visualization data' } },
      },
    },
    '/api/v1/agi-tutor/progress': {
      post: {
        tags: ['AGI Tutor'],
        summary: 'Track learning progress',
        operationId: 'trackLearningProgress',
        responses: { '200': { description: 'Progress tracked' } },
      },
    },
    '/api/v1/agi-tutor/recommendations': {
      post: {
        tags: ['AGI Tutor'],
        summary: 'Get personalized learning recommendations',
        operationId: 'getLearningRecommendations',
        responses: { '200': { description: 'Recommendations' } },
      },
    },
    '/api/v1/agi-tutor/emotional-support': {
      post: {
        tags: ['AGI Tutor'],
        summary: 'Provide emotional support and motivation',
        operationId: 'provideEmotionalSupport',
        responses: { '200': { description: 'Support provided' } },
      },
    },

    // ════════════════════════════════════════════════
    // Analytics Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/analytics/overview': {
      get: {
        tags: ['Analytics'],
        summary: 'Get overview statistics',
        operationId: 'getOverviewStats',
        responses: {
          '200': {
            description: 'Overview stats',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OverviewStats' } } },
          },
        },
      },
    },
    '/api/v1/analytics/report': {
      get: {
        tags: ['Analytics'],
        summary: 'Get detailed analytics report',
        operationId: 'getDetailedReport',
        responses: { '200': { description: 'Detailed report' } },
      },
    },
    '/api/v1/analytics/enrollment-trends': {
      get: {
        tags: ['Analytics'],
        summary: 'Get enrollment trends',
        operationId: 'getEnrollmentTrends',
        responses: {
          '200': {
            description: 'Enrollment trends',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/EnrollmentTrend' } } } },
          },
        },
      },
    },
    '/api/v1/analytics/completion-rates': {
      get: {
        tags: ['Analytics'],
        summary: 'Get course completion rates',
        operationId: 'getCompletionRates',
        responses: {
          '200': {
            description: 'Completion rates',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CompletionRate' } } } },
          },
        },
      },
    },
    '/api/v1/analytics/export': {
      get: {
        tags: ['Analytics'],
        summary: 'Export analytics data',
        operationId: 'exportAnalytics',
        responses: { '200': { description: 'Exported data' } },
      },
    },

    // ════════════════════════════════════════════════
    // Time-Lock Credential Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/time-lock/issue': {
      post: {
        tags: ['Time-Lock Credentials'],
        summary: 'Issue a new time-locked credential',
        operationId: 'issueTimeLockCredential',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/IssueCredentialRequest' } } },
        },
        responses: {
          '201': {
            description: 'Credential issued',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/TimeLockCredential' } } } } },
          },
        },
      },
    },
    '/api/v1/time-lock/release/{credentialId}': {
      post: {
        tags: ['Time-Lock Credentials'],
        summary: 'Release a time-locked credential',
        operationId: 'releaseTimeLockCredential',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'credentialId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Credential released' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/time-lock/batch-release': {
      post: {
        tags: ['Time-Lock Credentials'],
        summary: 'Batch release multiple credentials',
        operationId: 'batchReleaseCredentials',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchReleaseRequest' } } },
        },
        responses: { '200': { description: 'Batch release completed' } },
      },
    },
    '/api/v1/time-lock/emergency-revoke/{credentialId}': {
      post: {
        tags: ['Time-Lock Credentials'],
        summary: 'Emergency revoke a credential',
        operationId: 'emergencyRevokeCredential',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'credentialId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/EmergencyRevokeRequest' } } },
        },
        responses: { '200': { description: 'Credential revoked' } },
      },
    },
    '/api/v1/time-lock/schedule': {
      post: {
        tags: ['Time-Lock Credentials'],
        summary: 'Create a release schedule',
        operationId: 'createReleaseSchedule',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReleaseScheduleRequest' } } },
        },
        responses: {
          '201': { description: 'Schedule created' },
        },
      },
    },
    '/api/v1/time-lock/upcoming/{recipient}': {
      get: {
        tags: ['Time-Lock Credentials'],
        summary: 'Get upcoming releases for a recipient',
        operationId: 'getUpcomingReleases',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'recipient', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'timeWindow', in: 'query', schema: { type: 'integer', description: 'Time window in ms (default: 86400000)' } },
        ],
        responses: { '200': { description: 'Upcoming releases' } },
      },
    },
    '/api/v1/time-lock/recipient/{recipient}': {
      get: {
        tags: ['Time-Lock Credentials'],
        summary: 'Get credentials by recipient',
        operationId: 'getCredentialsByRecipient',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'recipient', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Credentials' } },
      },
    },
    '/api/v1/time-lock/issuer/{issuer}': {
      get: {
        tags: ['Time-Lock Credentials'],
        summary: 'Get credentials by issuer',
        operationId: 'getCredentialsByIssuer',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'issuer', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Credentials' } },
      },
    },
    '/api/v1/time-lock/audit/{credentialId}': {
      get: {
        tags: ['Time-Lock Credentials'],
        summary: 'Get audit trail for a credential',
        operationId: 'getCredentialAudit',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'credentialId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Audit trail' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },

    // ════════════════════════════════════════════════
    // VRF Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/vrf/request': {
      post: {
        tags: ['VRF'],
        summary: 'Request verifiable random number',
        operationId: 'requestVRF',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VRFRequest' } } },
        },
        responses: {
          '201': { description: 'VRF request created' },
        },
      },
    },
    '/api/v1/vrf/generate': {
      post: {
        tags: ['VRF'],
        summary: 'Generate random number for a purpose',
        operationId: 'generateVRF',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VRFGenerateRequest' } } },
        },
        responses: { '200': { description: 'Random value generated' } },
      },
    },
    '/api/v1/vrf/request/{requestId}': {
      get: {
        tags: ['VRF'],
        summary: 'Get VRF request details',
        operationId: 'getVRFRequest',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'requestId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Request details' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/vrf/user/{user}/requests': {
      get: {
        tags: ['VRF'],
        summary: "Get user's VRF requests",
        operationId: 'getUserVRFRequests',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'user', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Requests' } },
      },
    },
    '/api/v1/vrf/beacon/latest': {
      get: {
        tags: ['VRF'],
        summary: 'Get latest randomness beacon',
        operationId: 'getLatestBeacon',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Beacon data' } },
      },
    },
    '/api/v1/vrf/stats': {
      get: {
        tags: ['VRF'],
        summary: 'Get VRF system statistics',
        operationId: 'getVRFStats',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Statistics' } },
      },
    },
    '/api/v1/vrf/commit': {
      post: {
        tags: ['VRF'],
        summary: 'Commit to a value (commit-reveal scheme)',
        operationId: 'commitVRF',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VRFCommitRequest' } } },
        },
        responses: { '200': { description: 'Commitment recorded' } },
      },
    },
    '/api/v1/vrf/reveal': {
      post: {
        tags: ['VRF'],
        summary: 'Reveal committed value',
        operationId: 'revealVRF',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VRFRevealRequest' } } },
        },
        responses: { '200': { description: 'Value revealed' } },
      },
    },

    // ════════════════════════════════════════════════
    // Translation Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/translate/text': {
      post: {
        tags: ['Translation'],
        summary: 'Translate text content',
        operationId: 'translateText',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TranslateTextRequest' } } },
        },
        responses: { '200': { description: 'Translation completed' } },
      },
    },
    '/api/v1/translate/batch': {
      post: {
        tags: ['Translation'],
        summary: 'Batch translate multiple texts',
        operationId: 'batchTranslate',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchTranslateRequest' } } },
        },
        responses: { '200': { description: 'Batch translation completed' } },
      },
    },
    '/api/v1/translate/subtitles': {
      post: {
        tags: ['Translation'],
        summary: 'Translate and synchronize subtitles',
        operationId: 'translateSubtitles',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TranslateSubtitlesRequest' } } },
        },
        responses: { '200': { description: 'Subtitle translation completed' } },
      },
    },
    '/api/v1/translate/correction': {
      post: {
        tags: ['Translation'],
        summary: 'Submit a translation correction',
        operationId: 'submitTranslationCorrection',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitCorrectionRequest' } } },
        },
        responses: { '200': { description: 'Correction submitted' } },
      },
    },
    '/api/v1/translate/quality/{contentType}': {
      get: {
        tags: ['Translation'],
        summary: 'Get translation quality metrics',
        operationId: 'getTranslationQuality',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'contentType', in: 'path', required: false, schema: { type: 'string', enum: ['course', 'subtitle', 'interaction', 'general'] } },
        ],
        responses: { '200': { description: 'Quality metrics' } },
      },
    },

    // ════════════════════════════════════════════════
    // Cross-Protocol Bridge Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/cross-protocol-bridge/send': {
      post: {
        tags: ['Cross-Protocol Bridge'],
        summary: 'Send a cross-chain message',
        operationId: 'sendBridgeMessage',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BridgeSendRequest' } } },
        },
        responses: {
          '201': { description: 'Message sent' },
        },
      },
    },
    '/api/v1/cross-protocol-bridge/message/{messageId}': {
      get: {
        tags: ['Cross-Protocol Bridge'],
        summary: 'Get cross-chain message details',
        operationId: 'getBridgeMessage',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'messageId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Message details' },
          '404': { $ref: '#/components/responses/NotFoundError' },
        },
      },
    },
    '/api/v1/cross-protocol-bridge/user/{user}/messages': {
      get: {
        tags: ['Cross-Protocol Bridge'],
        summary: "Get user's bridge messages",
        operationId: 'getUserBridgeMessages',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'user', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Messages' } },
      },
    },
    '/api/v1/cross-protocol-bridge/batch': {
      post: {
        tags: ['Cross-Protocol Bridge'],
        summary: 'Batch messages for gas optimization',
        operationId: 'batchBridgeMessages',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BridgeBatchRequest' } } },
        },
        responses: {
          '201': { description: 'Batched' },
        },
      },
    },
    '/api/v1/cross-protocol-bridge/proof': {
      post: {
        tags: ['Cross-Protocol Bridge'],
        summary: 'Submit state proof for verification',
        operationId: 'submitBridgeProof',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BridgeProofRequest' } } },
        },
        responses: {
          '201': { description: 'Proof submitted' },
        },
      },
    },
    '/api/v1/cross-protocol-bridge/proof/{proofId}/verify': {
      post: {
        tags: ['Cross-Protocol Bridge'],
        summary: 'Verify state proof',
        operationId: 'verifyBridgeProof',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'proofId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Proof verified' } },
      },
    },
    '/api/v1/cross-protocol-bridge/gas-cost/{destinationChain}/{gasLimit}': {
      get: {
        tags: ['Cross-Protocol Bridge'],
        summary: 'Calculate gas cost for cross-chain message',
        operationId: 'calculateBridgeGas',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'destinationChain', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'gasLimit', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Gas cost calculated' } },
      },
    },
    '/api/v1/cross-protocol-bridge/stats': {
      get: {
        tags: ['Cross-Protocol Bridge'],
        summary: 'Get bridge statistics',
        operationId: 'getBridgeStats',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Statistics' } },
      },
    },

    // ════════════════════════════════════════════════
    // Admin Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/admin/dashboard': {
      get: {
        tags: ['Admin'],
        summary: 'Get admin dashboard statistics',
        operationId: 'getAdminDashboard',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Dashboard statistics',
            content: { 'application/json': { schema: { type: 'object', properties: { stats: { $ref: '#/components/schemas/AdminDashboardStats' } } } } },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '403': { $ref: '#/components/responses/ForbiddenError' },
        },
      },
    },
    '/api/v1/admin/logs': {
      get: {
        tags: ['Admin'],
        summary: 'Get system logs',
        operationId: 'getSystemLogs',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'level', in: 'query', schema: { type: 'string', enum: ['info', 'warning', 'error', 'debug', 'all'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'System logs',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedLogsResponse' } } },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '403': { $ref: '#/components/responses/ForbiddenError' },
        },
      },
    },
    '/api/v1/admin/reports/user-activity': {
      get: {
        tags: ['Admin'],
        summary: 'Get user activity report',
        operationId: 'getUserActivityReport',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', default: '30d' } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['student', 'educator', 'admin'] } },
        ],
        responses: {
          '200': { description: 'Activity report' },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
          '403': { $ref: '#/components/responses/ForbiddenError' },
        },
      },
    },
    '/api/v1/admin/reports/course-performance': {
      get: {
        tags: ['Admin'],
        summary: 'Get course performance report',
        operationId: 'getCoursePerformanceReport',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', default: '30d' } },
          { name: 'courseId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Performance report' } },
      },
    },
    '/api/v1/admin/settings': {
      get: {
        tags: ['Admin'],
        summary: 'Get system settings',
        operationId: 'getSystemSettings',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'System settings',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SystemSettings' } } },
          },
        },
      },
      put: {
        tags: ['Admin'],
        summary: 'Update system settings',
        operationId: 'updateSystemSettings',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateSettingsRequest' } } },
        },
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/api/v1/admin/backup': {
      post: {
        tags: ['Admin'],
        summary: 'Initiate system backup',
        operationId: 'initiateBackup',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BackupRequest' } } },
        },
        responses: { '200': { description: 'Backup initiated' } },
      },
    },
    '/api/v1/admin/backups': {
      get: {
        tags: ['Admin'],
        summary: 'List system backups',
        operationId: 'listBackups',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Backups list' } },
      },
    },
    '/api/v1/admin/announcements': {
      post: {
        tags: ['Admin'],
        summary: 'Create system announcement',
        operationId: 'createAnnouncement',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAnnouncementRequest' } } },
        },
        responses: {
          '201': { description: 'Announcement created' },
        },
      },
    },

    // ════════════════════════════════════════════════
    // ACO Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/aco/learning/setup': {
      post: {
        tags: ['ACO'],
        summary: 'Setup learning environment for ACO',
        operationId: 'acoSetupLearning',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOLearningSetupRequest' } } },
        },
        responses: { '200': { description: 'Environment setup' } },
      },
    },
    '/api/v1/aco/learning/optimize': {
      post: {
        tags: ['ACO'],
        summary: 'Optimize learning path using ACO',
        operationId: 'acoOptimizeLearningPath',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOOptimizeRequest' } } },
        },
        responses: { '200': { description: 'Optimized path' } },
      },
    },
    '/api/v1/aco/learning/alternatives': {
      post: {
        tags: ['ACO'],
        summary: 'Get alternative learning paths',
        operationId: 'acoGetAlternatives',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOAlternativesRequest' } } },
        },
        responses: { '200': { description: 'Alternatives' } },
      },
    },
    '/api/v1/aco/learning/analytics': {
      post: {
        tags: ['ACO'],
        summary: 'Get learning path analytics',
        operationId: 'acoLearningAnalytics',
        responses: { '200': { description: 'Analytics' } },
      },
    },
    '/api/v1/aco/resources/setup': {
      post: {
        tags: ['ACO'],
        summary: 'Setup resource environment',
        operationId: 'acoSetupResources',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOResourceSetupRequest' } } },
        },
        responses: { '200': { description: 'Resources setup' } },
      },
    },
    '/api/v1/aco/resources/optimize': {
      post: {
        tags: ['ACO'],
        summary: 'Optimize resource allocation',
        operationId: 'acoOptimizeResources',
        responses: { '200': { description: 'Allocation optimized' } },
      },
    },
    '/api/v1/aco/resources/analytics/{allocationId}': {
      get: {
        tags: ['ACO'],
        summary: 'Get resource allocation analytics',
        operationId: 'acoResourceAnalytics',
        parameters: [
          { name: 'allocationId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Analytics' } },
      },
    },
    '/api/v1/aco/replanning/initialize': {
      post: {
        tags: ['ACO'],
        summary: 'Initialize user path replanning',
        operationId: 'acoInitReplanning',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOReplanningInitRequest' } } },
        },
        responses: { '200': { description: 'Path initialized' } },
      },
    },
    '/api/v1/aco/replanning/events': {
      post: {
        tags: ['ACO'],
        summary: 'Record a change event for replanning',
        operationId: 'acoRecordEvent',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOReplanningEventRequest' } } },
        },
        responses: { '200': { description: 'Event recorded' } },
      },
    },
    '/api/v1/aco/replanning/path/{userId}': {
      get: {
        tags: ['ACO'],
        summary: "Get user's current path",
        operationId: 'acoGetPath',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Current path' } },
      },
    },
    '/api/v1/aco/replanning/analytics/{userId}': {
      get: {
        tags: ['ACO'],
        summary: "Get user's path analytics",
        operationId: 'acoGetPathAnalytics',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Path analytics' } },
      },
    },
    '/api/v1/aco/replanning/statistics': {
      get: {
        tags: ['ACO'],
        summary: 'Get replanning system statistics',
        operationId: 'acoReplanningStats',
        responses: { '200': { description: 'Statistics' } },
      },
    },
    '/api/v1/aco/swarm/agents': {
      post: {
        tags: ['ACO'],
        summary: 'Add agent to swarm',
        operationId: 'acoAddSwarmAgent',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOSwarmAddAgentRequest' } } },
        },
        responses: { '200': { description: 'Agent added' } },
      },
    },
    '/api/v1/aco/swarm/execute': {
      post: {
        tags: ['ACO'],
        summary: 'Execute swarm iteration',
        operationId: 'acoExecuteSwarm',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOSwarmExecuteRequest' } } },
        },
        responses: { '200': { description: 'Iteration started' } },
      },
    },
    '/api/v1/aco/swarm/statistics': {
      get: {
        tags: ['ACO'],
        summary: 'Get swarm statistics',
        operationId: 'acoSwarmStats',
        responses: { '200': { description: 'Swarm stats' } },
      },
    },
    '/api/v1/aco/analytics/visualization/{optimizationId}': {
      get: {
        tags: ['ACO'],
        summary: 'Get performance visualization',
        operationId: 'acoVisualization',
        parameters: [
          { name: 'optimizationId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'timeRange', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Visualization data' } },
      },
    },
    '/api/v1/aco/analytics/comparison': {
      post: {
        tags: ['ACO'],
        summary: 'Compare optimization results',
        operationId: 'acoComparison',
        responses: { '200': { description: 'Comparison' } },
      },
    },
    '/api/v1/aco/analytics/dashboard': {
      get: {
        tags: ['ACO'],
        summary: 'Get ACO dashboard data',
        operationId: 'acoDashboard',
        responses: { '200': { description: 'Dashboard data' } },
      },
    },
    '/api/v1/aco/analytics/export': {
      get: {
        tags: ['ACO'],
        summary: 'Export ACO analytics',
        operationId: 'acoExport',
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'] } },
        ],
        responses: { '200': { description: 'Exported data' } },
      },
    },
    '/api/v1/aco/health': {
      get: {
        tags: ['ACO'],
        summary: 'ACO system health check',
        operationId: 'acoHealth',
        responses: { '200': { description: 'Health status' } },
      },
    },
    '/api/v1/aco/config': {
      get: {
        tags: ['ACO'],
        summary: 'Get ACO system configuration',
        operationId: 'acoGetConfig',
        responses: { '200': { description: 'Configuration' } },
      },
      put: {
        tags: ['ACO'],
        summary: 'Update ACO system configuration',
        operationId: 'acoUpdateConfig',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ACOConfigUpdateRequest' } } },
        },
        responses: { '200': { description: 'Configuration updated' } },
      },
    },

    // ════════════════════════════════════════════════
    // RBAC Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/rbac/permissions': {
      get: {
        tags: ['RBAC'],
        summary: 'Get all permissions',
        operationId: 'getPermissions',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Permissions retrieved' } },
      },
    },
    '/api/v1/rbac/roles': {
      get: {
        tags: ['RBAC'],
        summary: 'Get all roles',
        operationId: 'getRoles',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Roles retrieved' } },
      },
      post: {
        tags: ['RBAC'],
        summary: 'Create a new role',
        operationId: 'createRole',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Role created' } },
      },
    },

    // ════════════════════════════════════════════════
    // Gamification Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/gamification/points': {
      get: {
        tags: ['Gamification'],
        summary: 'Get user points',
        operationId: 'getUserPoints',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Points retrieved' } },
      },
      post: {
        tags: ['Gamification'],
        summary: 'Award points to user',
        operationId: 'awardPoints',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Points awarded' } },
      },
    },
    '/api/v1/gamification/leaderboard': {
      get: {
        tags: ['Gamification'],
        summary: 'Get leaderboard',
        operationId: 'getLeaderboard',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Leaderboard retrieved' } },
      },
    },
    '/api/v1/gamification/achievements': {
      get: {
        tags: ['Gamification'],
        summary: 'Get achievements',
        operationId: 'getAchievements',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Achievements retrieved' } },
      },
    },
    '/api/v1/gamification/badges': {
      get: {
        tags: ['Gamification'],
        summary: 'Get badges',
        operationId: 'getBadges',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Badges retrieved' } },
      },
    },

    // ════════════════════════════════════════════════
    // Autonomous Agents Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/autonomous-agents': {
      get: {
        tags: ['Autonomous Agents'],
        summary: 'List autonomous agents',
        operationId: 'listAgents',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Agents listed' } },
      },
      post: {
        tags: ['Autonomous Agents'],
        summary: 'Create autonomous agent',
        operationId: 'createAgent',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Agent created' } },
      },
    },
    '/api/v1/autonomous-agents/{agentId}': {
      get: {
        tags: ['Autonomous Agents'],
        summary: 'Get agent details',
        operationId: 'getAgent',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Agent details' } },
      },
      delete: {
        tags: ['Autonomous Agents'],
        summary: 'Delete autonomous agent',
        operationId: 'deleteAgent',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Agent deleted' } },
      },
    },

    // ════════════════════════════════════════════════
    // Holographic Storage Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/holographic/store': {
      post: {
        tags: ['Holographic'],
        summary: 'Store data in holographic storage',
        operationId: 'holographicStore',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Data stored' } },
      },
    },
    '/api/v1/holographic/retrieve/{id}': {
      get: {
        tags: ['Holographic'],
        summary: 'Retrieve data from holographic storage',
        operationId: 'holographicRetrieve',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Data retrieved' } },
      },
    },
    '/api/v1/holographic/health': {
      get: {
        tags: ['Holographic'],
        summary: 'Holographic storage health check',
        operationId: 'holographicHealth',
        responses: { '200': { description: 'Health status' } },
      },
    },

    // ════════════════════════════════════════════════
    // Secure Communication Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/secure-comm/keypair': {
      post: {
        tags: ['Secure Communication'],
        summary: 'Generate quantum-resistant key pair',
        operationId: 'generateKeypair',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Key pair generated' } },
      },
    },
    '/api/v1/secure-comm/encrypt': {
      post: {
        tags: ['Secure Communication'],
        summary: 'Encrypt a message',
        operationId: 'encryptMessage',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Message encrypted' } },
      },
    },
    '/api/v1/secure-comm/decrypt': {
      post: {
        tags: ['Secure Communication'],
        summary: 'Decrypt a message',
        operationId: 'decryptMessage',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Message decrypted' } },
      },
    },
    '/api/v1/secure-comm/sign': {
      post: {
        tags: ['Secure Communication'],
        summary: 'Sign a message',
        operationId: 'signMessage',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Message signed' } },
      },
    },
    '/api/v1/secure-comm/verify': {
      post: {
        tags: ['Secure Communication'],
        summary: 'Verify a signature',
        operationId: 'verifySignature',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Signature verified' } },
      },
    },

    // ════════════════════════════════════════════════
    // Assignment Endpoints
    // ════════════════════════════════════════════════
    '/api/v1/assignments/courses/{courseId}/assignments': {
      post: {
        tags: ['Assignments'],
        summary: 'Create assignment for a course',
        operationId: 'createAssignment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '201': { description: 'Assignment created' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
      get: {
        tags: ['Assignments'],
        summary: "Get course's assignments",
        operationId: 'getCourseAssignments',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Assignments' } },
      },
    },
    '/api/v1/assignments/assignments/{assignmentId}': {
      get: {
        tags: ['Assignments'],
        summary: 'Get assignment by ID',
        operationId: 'getAssignment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Assignment details' } },
      },
      put: {
        tags: ['Assignments'],
        summary: 'Update assignment',
        operationId: 'updateAssignment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Assignment updated' } },
      },
      delete: {
        tags: ['Assignments'],
        summary: 'Delete assignment',
        operationId: 'deleteAssignment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Assignment deleted' } },
      },
    },
    '/api/v1/assignments/assignments/{assignmentId}/submissions': {
      post: {
        tags: ['Assignments'],
        summary: 'Create submission for assignment',
        operationId: 'createSubmission',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 10 } } } } },
        },
        responses: { '201': { description: 'Submission created' } },
      },
      get: {
        tags: ['Assignments'],
        summary: "Get assignment's submissions",
        operationId: 'getSubmissions',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Submissions' } },
      },
    },
    '/api/v1/assignments/submissions/{submissionId}': {
      get: {
        tags: ['Assignments'],
        summary: 'Get submission by ID',
        operationId: 'getAssignmentSubmission',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Submission details' } },
      },
      put: {
        tags: ['Assignments'],
        summary: 'Update submission',
        operationId: 'updateAssignmentSubmission',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Submission updated' } },
      },
    },
    '/api/v1/assignments/submissions/{submissionId}/submit': {
      post: {
        tags: ['Assignments'],
        summary: 'Submit assignment for grading',
        operationId: 'submitAssignment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Assignment submitted' } },
      },
    },
    '/api/v1/assignments/submissions/{submissionId}/grade': {
      post: {
        tags: ['Assignments'],
        summary: 'Grade a submission',
        operationId: 'gradeSubmission',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GradeSubmissionRequest' } } },
        },
        responses: { '200': { description: 'Submission graded' } },
      },
    },
    '/api/v1/assignments/assignments/{assignmentId}/grades': {
      get: {
        tags: ['Assignments'],
        summary: "Get assignment's grades",
        operationId: 'getAssignmentGrades',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Grades' } },
      },
    },
    '/api/v1/assignments/assignments/{assignmentId}/stats': {
      get: {
        tags: ['Assignments'],
        summary: 'Get assignment statistics',
        operationId: 'getAssignmentStats',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Statistics' } },
      },
    },
    '/api/v1/assignments/courses/{courseId}/progress': {
      get: {
        tags: ['Assignments'],
        summary: 'Get student progress for a course',
        operationId: 'getStudentProgress',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Progress data' } },
      },
    },
    '/api/v1/assignments/assignments/{assignmentId}/bulk-grade': {
      post: {
        tags: ['Assignments'],
        summary: 'Bulk grade submissions',
        operationId: 'bulkGrade',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Bulk grading completed' } },
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
