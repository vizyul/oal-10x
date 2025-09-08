const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/auth.service');
const database = require('../../src/services/database.service');
const youtubeMetadataService = require('../../src/services/youtube-metadata.service');

// Mock services
jest.mock('../../src/services/auth.service');
jest.mock('../../src/services/database.service');
jest.mock('../../src/services/youtube-metadata.service');
jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('API Routes Integration Tests', () => {
  let authToken;
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUser = {
      id: 'rec123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      status: 'active',
      emailVerified: true,
      subscription_tier: 'free'
    };

    authToken = 'Bearer mock-jwt-token';
    
    // Mock auth middleware to pass
    authService.findUserById = jest.fn().mockResolvedValue(mockUser);
  });

  describe('Health Check', () => {
    describe('GET /health', () => {
      it('should return health status', async () => {
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body).toEqual({
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number)
        });
      });
    });
  });

  describe('YouTube Import API', () => {
    describe('POST /api/youtube/import', () => {
      it('should import YouTube video successfully', async () => {
        const videoData = {
          id: 'abc123',
          snippet: {
            title: 'Test Video',
            description: 'Test video description',
            publishedAt: '2023-01-01T00:00:00Z',
            channelTitle: 'Test Channel',
            thumbnails: {
              high: { url: 'https://img.youtube.com/vi/abc123/hqdefault.jpg' }
            }
          },
          contentDetails: {
            duration: 'PT5M30S'
          }
        };

        const airtableRecord = {
          id: 'rec456',
          fields: {
            'video_title': 'Test Video',
            'youtube_url': 'https://youtube.com/watch?v=abc123',
            'description': 'Test video description',
            'duration': 330
          }
        };

        youtubeMetadataService.getVideoMetadata.mockResolvedValue(videoData);
        airtableService.create.mockResolvedValue(airtableRecord);

        const response = await request(app)
          .post('/api/youtube/import')
          .set('Authorization', authToken)
          .send({ 
            url: 'https://youtube.com/watch?v=abc123',
            userId: mockUser.id
          })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Video imported successfully',
          video: expect.objectContaining({
            youtube_url: 'https://youtube.com/watch?v=abc123',
            video_title: 'Test Video'
          })
        });

        expect(youtubeMetadataService.getVideoMetadata).toHaveBeenCalledWith('abc123');
        expect(airtableService.create).toHaveBeenCalledWith('Videos', expect.objectContaining({
          'youtube_url': 'https://youtube.com/watch?v=abc123',
          'video_title': 'Test Video',
          'user_id': [mockUser.id]
        }));
      });

      it('should validate YouTube URL format', async () => {
        const response = await request(app)
          .post('/api/youtube/import')
          .set('Authorization', authToken)
          .send({ 
            url: 'https://not-youtube.com/watch?v=abc123',
            userId: mockUser.id
          })
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          message: 'Invalid YouTube URL format'
        });
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .post('/api/youtube/import')
          .send({ url: 'https://youtube.com/watch?v=abc123' })
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should handle YouTube API errors', async () => {
        youtubeMetadataService.getVideoMetadata.mockRejectedValue(
          new Error('Video not found')
        );

        const response = await request(app)
          .post('/api/youtube/import')
          .set('Authorization', authToken)
          .send({ 
            url: 'https://youtube.com/watch?v=invalid123',
            userId: mockUser.id
          })
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          message: 'Failed to fetch video metadata'
        });
      });
    });

    describe('GET /api/youtube/videos', () => {
      it('should return user videos', async () => {
        const mockVideos = [
          {
            id: 'rec123',
            fields: {
              'video_title': 'Video 1',
              'youtube_url': 'https://youtube.com/watch?v=abc123',
              'created_at': '2023-01-01T00:00:00.000Z'
            }
          },
          {
            id: 'rec456',
            fields: {
              'video_title': 'Video 2', 
              'youtube_url': 'https://youtube.com/watch?v=def456',
              'created_at': '2023-01-02T00:00:00.000Z'
            }
          }
        ];

        airtableService.findByField.mockResolvedValue(mockVideos);

        const response = await request(app)
          .get('/api/youtube/videos')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          videos: expect.arrayContaining([
            expect.objectContaining({
              video_title: 'Video 1',
              youtube_url: 'https://youtube.com/watch?v=abc123'
            }),
            expect.objectContaining({
              video_title: 'Video 2', 
              youtube_url: 'https://youtube.com/watch?v=def456'
            })
          ])
        });

        expect(airtableService.findByField).toHaveBeenCalledWith('Videos', 'user_id', mockUser.id);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/youtube/videos')
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should handle empty video list', async () => {
        airtableService.findByField.mockResolvedValue([]);

        const response = await request(app)
          .get('/api/youtube/videos')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          videos: []
        });
      });
    });
  });

  describe('User Profile API', () => {
    describe('GET /api/user/profile', () => {
      it('should return user profile', async () => {
        const response = await request(app)
          .get('/api/user/profile')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          user: expect.objectContaining({
            id: mockUser.id,
            email: mockUser.email,
            firstName: mockUser.firstName,
            lastName: mockUser.lastName
          })
        });
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/user/profile')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('PUT /api/user/profile', () => {
      it('should update user profile', async () => {
        const updateData = {
          firstName: 'Jane',
          lastName: 'Smith'
        };

        const updatedUser = {
          ...mockUser,
          firstName: 'Jane',
          lastName: 'Smith'
        };

        authService.updateUser.mockResolvedValue(updatedUser);

        const response = await request(app)
          .put('/api/user/profile')
          .set('Authorization', authToken)
          .send(updateData)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Profile updated successfully',
          user: expect.objectContaining({
            firstName: 'Jane',
            lastName: 'Smith'
          })
        });

        expect(authService.updateUser).toHaveBeenCalledWith(mockUser.id, updateData);
      });

      it('should validate update data', async () => {
        const response = await request(app)
          .put('/api/user/profile')
          .set('Authorization', authToken)
          .send({ firstName: '' })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .put('/api/user/profile')
          .send({ firstName: 'Jane' })
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Subscription API', () => {
    describe('GET /api/user/subscription', () => {
      it('should return subscription status', async () => {
        const mockUserWithSub = {
          ...mockUser,
          subscription_tier: 'premium',
          subscription_status: 'active'
        };

        authService.findUserById.mockResolvedValue(mockUserWithSub);

        const response = await request(app)
          .get('/api/user/subscription')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          subscription: {
            tier: 'premium',
            status: 'active',
            features: expect.any(Object)
          }
        });
      });

      it('should handle free tier users', async () => {
        const response = await request(app)
          .get('/api/user/subscription')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.subscription.tier).toBe('free');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/user/subscription')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown API endpoints', async () => {
      const response = await request(app)
        .get('/api/unknown-endpoint')
        .set('Authorization', authToken)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'API endpoint not found'
      });
    });

    it('should handle internal server errors', async () => {
      // Mock a service to throw an error
      airtableService.findByField.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/youtube/videos')
        .set('Authorization', authToken)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal server error'
      });
    });

    it('should validate request body size', async () => {
      const largePayload = {
        data: 'x'.repeat(10 * 1024 * 1024) // 10MB of data
      };

      const response = await request(app)
        .post('/api/youtube/import')
        .set('Authorization', authToken)
        .send(largePayload)
        .expect(413);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on API endpoints', async () => {
      airtableService.findByField.mockResolvedValue([]);

      // Make multiple rapid requests
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/api/youtube/videos')
          .set('Authorization', authToken);
      }

      // Subsequent request should be rate limited
      const response = await request(app)
        .get('/api/youtube/videos')
        .set('Authorization', authToken)
        .expect(429);

      expect(response.body.error).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});