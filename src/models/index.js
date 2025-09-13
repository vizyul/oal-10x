/**
 * Models Index
 * Centralized exports for all database models
 */

const BaseModel = require('./BaseModel');
const AiPrompts = require('./AiPrompts');
const ApiKeys = require('./ApiKeys');
const ContentType = require('./ContentType');
const Sessions = require('./Sessions');
const SubscriptionEvents = require('./SubscriptionEvents');
const SubscriptionUsage = require('./SubscriptionUsage');
const User = require('./User');
const UserPreferences = require('./UserPreferences');
const UserSubscription = require('./UserSubscription');
const Video = require('./Video');
const VideoContent = require('./VideoContent');
const YoutubeOauthTokens = require('./YoutubeOauthTokens');
const UserYoutubeChannels = require('./UserYoutubeChannels');

// Initialize model instances
const aiPromptsModel = new AiPrompts();
const apiKeysModel = new ApiKeys();
const contentTypeModel = new ContentType();
const sessionsModel = new Sessions();
const subscriptionEventsModel = new SubscriptionEvents();
const subscriptionUsageModel = new SubscriptionUsage();
const userModel = new User();
const userPreferencesModel = new UserPreferences();
const userSubscriptionModel = new UserSubscription();
const videoModel = new Video();
const videoContentModel = new VideoContent();
const youtubeOauthTokensModel = new YoutubeOauthTokens();
const userYoutubeChannelsModel = new UserYoutubeChannels();

module.exports = {
  BaseModel,
  AiPrompts,
  ApiKeys,
  ContentType,
  Sessions,
  SubscriptionEvents,
  SubscriptionUsage,
  User,
  UserPreferences,
  UserSubscription,
  Video,
  VideoContent,
  YoutubeOauthTokens,
  UserYoutubeChannels,
  
  // Pre-initialized instances for convenience
  aiPrompts: aiPromptsModel,
  apiKeys: apiKeysModel,
  contentType: contentTypeModel,
  sessions: sessionsModel,
  subscriptionEvents: subscriptionEventsModel,
  subscriptionUsage: subscriptionUsageModel,
  user: userModel,
  userPreferences: userPreferencesModel,
  userSubscription: userSubscriptionModel,
  video: videoModel,
  videoContent: videoContentModel,
  youtubeOauthTokens: youtubeOauthTokensModel,
  userYoutubeChannels: userYoutubeChannelsModel
};