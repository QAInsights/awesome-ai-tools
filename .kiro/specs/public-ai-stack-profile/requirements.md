# Requirements Document

## Introduction

The Public AI Stack Profile feature transforms user Zaps (tool votes) into shareable public profiles at `ai.dosa.dev/@username`. This feature enables developers to showcase their AI tool stack publicly, similar to how Linktree enables link sharing or Stack Overflow Careers showcases developer profiles. The feature integrates with the existing authentication system (Google OAuth and GitHub OAuth) and leverages the existing Zap/voting data to automatically populate user profiles with their preferred AI tools.

## Glossary

- **Profile_System**: The backend and frontend components responsible for managing user profiles
- **Profile_Page**: The public-facing page at `/@username` displaying a user's AI tool stack
- **Profile_Data**: User-provided information including bio, avatar, social links, and privacy settings
- **Zap_Data**: The collection of tools a user has voted for (zapped)
- **Username_Registry**: The system component that manages username uniqueness and reservations
- **Analytics_Engine**: The component that tracks and reports profile views and interactions
- **SEO_Generator**: The component that generates meta tags and structured data for profile pages
- **Privacy_Controller**: The component that enforces profile visibility settings
- **Social_Card_Generator**: The component that generates Open Graph images for social media sharing
- **Widget_Renderer**: The component that generates embeddable profile widgets
- **Badge_Integration**: The existing GitHub README badge generator system
- **Auth_System**: The existing Google OAuth and GitHub OAuth authentication system
- **Tool_Directory**: The existing curated directory of 100+ AI coding tools
- **Category_System**: The existing tool categorization system (12 categories)

## Requirements

### Requirement 1: Username Management

**User Story:** As a developer, I want to claim a unique username, so that I can have a memorable profile URL to share.

#### Acceptance Criteria

1. WHEN a user signs in for the first time, THE Profile_System SHALL prompt them to claim a username
2. THE Username_Registry SHALL enforce username uniqueness across all users
3. THE Username_Registry SHALL validate usernames to contain only lowercase letters, numbers, hyphens, and underscores
4. THE Username_Registry SHALL enforce username length between 3 and 30 characters
5. THE Username_Registry SHALL reject usernames that match reserved routes (api, admin, settings, tools, blog, help, compare, zap)
6. WHEN a user attempts to claim a taken username, THE Profile_System SHALL display an error message and suggest available alternatives
7. WHERE a user has a GitHub account linked, THE Profile_System SHALL pre-populate the username field with their GitHub username
8. THE Profile_System SHALL allow users to change their username once every 30 days
9. WHEN a username is changed, THE Profile_System SHALL create a redirect from the old username to the new username for 90 days

### Requirement 2: Profile Creation and Editing

**User Story:** As a developer, I want to customize my profile with bio, avatar, and social links, so that I can build my personal brand.

#### Acceptance Criteria

1. THE Profile_System SHALL allow authenticated users to create and edit their profile
2. THE Profile_System SHALL provide fields for bio (maximum 280 characters), avatar URL, GitHub username, Twitter handle, LinkedIn URL, and personal website URL
3. WHERE a user authenticated via GitHub, THE Profile_System SHALL pre-populate the avatar with their GitHub avatar
4. WHERE a user authenticated via Google, THE Profile_System SHALL pre-populate the avatar with their Google profile picture
5. THE Profile_System SHALL validate social media URLs to ensure they are properly formatted
6. THE Profile_System SHALL sanitize all user-provided text inputs to prevent XSS attacks
7. THE Profile_System SHALL save profile changes immediately without requiring a separate save action
8. WHEN profile data is updated, THE Profile_System SHALL invalidate cached profile pages within 60 seconds

### Requirement 3: Public Profile Display

**User Story:** As a developer, I want a public profile URL showing my AI tool stack, so that I can share it on social media, GitHub, and my portfolio.

#### Acceptance Criteria

1. THE Profile_Page SHALL be accessible at the route `/@username`
2. THE Profile_Page SHALL display the user's avatar, name, bio, and social links
3. THE Profile_Page SHALL display all tools the user has zapped, organized by category
4. THE Profile_Page SHALL display the total count of zapped tools
5. THE Profile_Page SHALL use the existing Category_System to group tools into sections
6. THE Profile_Page SHALL display tool cards with name, company, description, and category
7. THE Profile_Page SHALL provide clickable links to each tool's detail page
8. THE Profile_Page SHALL be mobile-responsive and render correctly on screens from 320px to 2560px width
9. WHERE a profile is set to private, THE Profile_Page SHALL display a 404 error to non-authenticated users
10. THE Profile_Page SHALL load within 2 seconds on a 3G connection

### Requirement 4: Privacy Controls

**User Story:** As a developer, I want to control whether my profile is public or private, so that I can manage my online presence.

#### Acceptance Criteria

1. THE Privacy_Controller SHALL provide a toggle to set profile visibility to public or private
2. THE Privacy_Controller SHALL default new profiles to private until the user explicitly makes them public
3. WHEN a profile is set to private, THE Profile_Page SHALL return HTTP 404 to unauthenticated requests
4. WHEN a profile is set to private, THE Profile_Page SHALL display normally to the profile owner when authenticated
5. THE Privacy_Controller SHALL allow users to change privacy settings at any time
6. WHEN privacy settings change from public to private, THE SEO_Generator SHALL add noindex meta tags within 60 seconds

### Requirement 5: Profile Analytics

**User Story:** As a developer, I want to see analytics on my profile views, so that I can measure engagement.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL track unique profile views using visitor fingerprinting
2. THE Analytics_Engine SHALL track total profile views including repeat visits
3. THE Analytics_Engine SHALL track clicks on tool cards within the profile
4. THE Analytics_Engine SHALL track clicks on social media links within the profile
5. THE Analytics_Engine SHALL track clicks on the GitHub README badge when it links to the profile
6. THE Analytics_Engine SHALL provide a dashboard showing views over time (7 days, 30 days, all time)
7. THE Analytics_Engine SHALL display top 5 most-clicked tools from the profile
8. THE Analytics_Engine SHALL update analytics data with a maximum delay of 5 minutes
9. THE Analytics_Engine SHALL exclude the profile owner's own views from analytics counts
10. THE Analytics_Engine SHALL store analytics data for a minimum of 90 days

### Requirement 6: Social Media Integration

**User Story:** As a developer, I want my profile to display properly when shared on social media, so that it attracts more views.

#### Acceptance Criteria

1. THE SEO_Generator SHALL generate Open Graph meta tags for each profile page
2. THE SEO_Generator SHALL generate Twitter Card meta tags for each profile page
3. THE Social_Card_Generator SHALL create a dynamic Open Graph image showing the user's avatar, name, and tool count
4. THE Social_Card_Generator SHALL render Open Graph images at 1200x630 pixels
5. THE SEO_Generator SHALL include the profile URL as the canonical URL
6. THE SEO_Generator SHALL generate a meta description using the user's bio or a default template
7. THE SEO_Generator SHALL include structured data (JSON-LD) marking the profile as a Person schema
8. WHEN a profile is shared on Twitter, THE Profile_Page SHALL display a large summary card with the generated image
9. WHEN a profile is shared on LinkedIn, THE Profile_Page SHALL display the generated image and description

### Requirement 7: Embeddable Profile Widget

**User Story:** As a developer, I want to embed my AI tool stack on my personal website, so that visitors can see my tools without leaving my site.

#### Acceptance Criteria

1. THE Widget_Renderer SHALL generate an embeddable iframe widget for each public profile
2. THE Widget_Renderer SHALL provide widget code in HTML format that users can copy
3. THE Widget_Renderer SHALL offer widget size options: small (300x400px), medium (400x600px), large (600x800px)
4. THE Widget_Renderer SHALL render widgets with a transparent or customizable background
5. THE Widget_Renderer SHALL include clickable tool cards that link to the full Tool_Directory
6. THE Widget_Renderer SHALL update widget content automatically when the user's Zap_Data changes
7. THE Widget_Renderer SHALL load widgets asynchronously to avoid blocking page load
8. THE Widget_Renderer SHALL respect the profile's privacy settings and display nothing for private profiles

### Requirement 8: GitHub README Badge Integration

**User Story:** As a developer, I want my GitHub README badge to link to my profile, so that GitHub visitors can explore my full AI tool stack.

#### Acceptance Criteria

1. THE Badge_Integration SHALL generate a badge that links to `ai.dosa.dev/@username`
2. THE Badge_Integration SHALL display the user's total zap count on the badge
3. THE Badge_Integration SHALL update the badge count within 5 minutes when the user zaps a new tool
4. THE Badge_Integration SHALL provide badge code in Markdown format
5. THE Badge_Integration SHALL offer badge style options: flat, flat-square, plastic, for-the-badge
6. THE Badge_Integration SHALL track clicks on the badge and attribute them to profile analytics
7. WHERE a user has not claimed a username, THE Badge_Integration SHALL link to the main Tool_Directory instead

### Requirement 9: Profile Discovery and Search

**User Story:** As a team lead, I want to discover profiles of developers using specific tools, so that I can learn from their tool choices.

#### Acceptance Criteria

1. THE Profile_System SHALL provide a profile directory page at `/profiles`
2. THE Profile_System SHALL list all public profiles sorted by total zaps (descending)
3. THE Profile_System SHALL allow filtering profiles by specific tools they have zapped
4. THE Profile_System SHALL allow filtering profiles by tool categories
5. THE Profile_System SHALL provide a search box to find profiles by username or name
6. THE Profile_System SHALL display profile cards showing avatar, name, bio snippet (first 100 characters), and zap count
7. THE Profile_System SHALL paginate the profile directory with 24 profiles per page
8. THE Profile_System SHALL generate SEO-friendly URLs for filtered views (e.g., `/profiles?tool=cursor`)

### Requirement 10: Profile Data Export

**User Story:** As a developer, I want to export my profile data, so that I have a backup and can use it elsewhere.

#### Acceptance Criteria

1. THE Profile_System SHALL provide a data export feature in the settings page
2. THE Profile_System SHALL export profile data in JSON format
3. THE Profile_System SHALL include all Profile_Data fields in the export
4. THE Profile_System SHALL include a list of all zapped tools with tool IDs and names in the export
5. THE Profile_System SHALL include analytics summary data in the export
6. THE Profile_System SHALL generate the export file within 10 seconds
7. THE Profile_System SHALL name the export file as `ai-dosa-profile-{username}-{timestamp}.json`

### Requirement 11: Profile Performance and Caching

**User Story:** As a developer, I want my profile to load quickly, so that visitors have a good experience.

#### Acceptance Criteria

1. THE Profile_System SHALL statically generate profile pages at build time for all public profiles
2. THE Profile_System SHALL regenerate profile pages when Zap_Data or Profile_Data changes
3. THE Profile_System SHALL cache profile pages at the CDN edge for 60 seconds
4. THE Profile_System SHALL use stale-while-revalidate caching to serve cached content while updating in the background
5. THE Profile_System SHALL lazy-load tool card images below the fold
6. THE Profile_System SHALL preload critical assets (avatar, fonts) for faster rendering
7. THE Profile_System SHALL achieve a Lighthouse performance score of 90 or higher
8. THE Profile_System SHALL achieve a First Contentful Paint (FCP) of under 1.5 seconds on 3G

### Requirement 12: Profile URL Routing

**User Story:** As a developer, I want my profile URL to be clean and memorable, so that it is easy to share.

#### Acceptance Criteria

1. THE Profile_System SHALL route requests to `/@username` to the profile page
2. THE Profile_System SHALL return HTTP 404 for non-existent usernames
3. THE Profile_System SHALL handle case-insensitive username lookups (e.g., `/@JohnDoe` and `/@johndoe` resolve to the same profile)
4. THE Profile_System SHALL redirect `/@username/` (with trailing slash) to `/@username` (without trailing slash)
5. THE Profile_System SHALL preserve query parameters when redirecting (e.g., `/@username/?ref=twitter` redirects to `/@username?ref=twitter`)
6. THE Profile_System SHALL not conflict with existing routes (`/tools`, `/blog`, `/settings`, etc.)

### Requirement 13: Profile Notifications

**User Story:** As a developer, I want to receive notifications when my profile reaches view milestones, so that I feel engaged with the platform.

#### Acceptance Criteria

1. WHEN a profile reaches 100 views, THE Profile_System SHALL display a congratulatory message on the user's next login
2. WHEN a profile reaches 500 views, THE Profile_System SHALL display a congratulatory message on the user's next login
3. WHEN a profile reaches 1000 views, THE Profile_System SHALL display a congratulatory message on the user's next login
4. THE Profile_System SHALL display milestone notifications as dismissible toasts in the top-right corner
5. THE Profile_System SHALL not repeat milestone notifications once dismissed
6. THE Profile_System SHALL store notification dismissal state in localStorage

### Requirement 14: Profile Accessibility

**User Story:** As a developer with visual impairments, I want the profile page to be accessible, so that I can use screen readers to navigate it.

#### Acceptance Criteria

1. THE Profile_Page SHALL use semantic HTML elements (header, main, section, article)
2. THE Profile_Page SHALL provide alt text for all images including avatars and tool logos
3. THE Profile_Page SHALL ensure all interactive elements are keyboard-navigable
4. THE Profile_Page SHALL provide ARIA labels for icon-only buttons
5. THE Profile_Page SHALL maintain a color contrast ratio of at least 4.5:1 for all text
6. THE Profile_Page SHALL support screen reader announcements for dynamic content updates
7. THE Profile_Page SHALL achieve a Lighthouse accessibility score of 95 or higher

### Requirement 15: Profile Moderation

**User Story:** As a platform administrator, I want to moderate profiles for inappropriate content, so that the platform remains professional.

#### Acceptance Criteria

1. THE Profile_System SHALL provide an admin interface to flag profiles for review
2. THE Profile_System SHALL allow administrators to hide profiles without deleting user accounts
3. WHEN a profile is hidden by an administrator, THE Profile_Page SHALL return HTTP 404 to all users except the profile owner
4. THE Profile_System SHALL log all moderation actions with timestamp and administrator ID
5. THE Profile_System SHALL allow administrators to send a notification to the profile owner explaining why their profile was hidden
6. THE Profile_System SHALL provide a profanity filter for bio and username fields
7. WHEN profanity is detected, THE Profile_System SHALL prevent profile creation and display a user-friendly error message

### Requirement 16: Integration with Existing Zap System

**User Story:** As a developer, I want my profile to automatically update when I zap new tools, so that my profile stays current without manual updates.

#### Acceptance Criteria

1. WHEN a user zaps a tool, THE Profile_System SHALL add that tool to their profile within 5 seconds
2. WHEN a user un-zaps a tool (if un-zapping is implemented), THE Profile_System SHALL remove that tool from their profile within 5 seconds
3. THE Profile_System SHALL maintain the chronological order of zapped tools (most recent first)
4. THE Profile_System SHALL provide a toggle to sort tools by category instead of chronological order
5. THE Profile_System SHALL display a timestamp showing when each tool was zapped
6. THE Profile_System SHALL highlight newly zapped tools with a "New" badge for 7 days

### Requirement 17: Profile Sharing Features

**User Story:** As a developer, I want easy ways to share my profile, so that I can promote it across multiple channels.

#### Acceptance Criteria

1. THE Profile_Page SHALL provide share buttons for Twitter, LinkedIn, Facebook, and email
2. WHEN the Twitter share button is clicked, THE Profile_System SHALL open a pre-filled tweet with the profile URL and a default message
3. WHEN the LinkedIn share button is clicked, THE Profile_System SHALL open LinkedIn's share dialog with the profile URL
4. THE Profile_Page SHALL provide a "Copy Link" button that copies the profile URL to the clipboard
5. WHEN the link is copied, THE Profile_System SHALL display a confirmation toast message
6. THE Profile_Page SHALL track which share method was used and include it in analytics
7. THE Profile_Page SHALL generate a QR code for the profile URL that users can download

### Requirement 18: Profile Comparison Feature

**User Story:** As a recruiter, I want to compare multiple developer profiles side-by-side, so that I can assess their tool proficiency.

#### Acceptance Criteria

1. THE Profile_System SHALL provide a comparison view at `/profiles/compare`
2. THE Profile_System SHALL allow selecting up to 3 profiles for comparison
3. THE Profile_System SHALL display profiles side-by-side in a responsive grid
4. THE Profile_System SHALL highlight tools that are common across all selected profiles
5. THE Profile_System SHALL highlight tools that are unique to each profile
6. THE Profile_System SHALL display a Venn diagram showing tool overlap between profiles
7. THE Profile_System SHALL allow sharing the comparison view via a unique URL
8. THE Profile_System SHALL generate comparison URLs in the format `/profiles/compare?users=alice,bob,charlie`

### Requirement 19: Profile Onboarding Flow

**User Story:** As a new user, I want a guided onboarding flow, so that I understand how to set up my profile.

#### Acceptance Criteria

1. WHEN a user signs in for the first time, THE Profile_System SHALL display a welcome modal
2. THE Profile_System SHALL guide users through claiming a username in step 1
3. THE Profile_System SHALL guide users through adding a bio and social links in step 2
4. THE Profile_System SHALL guide users through setting privacy preferences in step 3
5. THE Profile_System SHALL allow users to skip onboarding steps
6. THE Profile_System SHALL allow users to complete onboarding later from the settings page
7. THE Profile_System SHALL display a progress indicator showing which step the user is on
8. WHEN onboarding is completed, THE Profile_System SHALL redirect users to their new profile page

### Requirement 20: Profile API for Third-Party Integrations

**User Story:** As a developer, I want a public API to fetch profile data, so that I can integrate my profile into other applications.

#### Acceptance Criteria

1. THE Profile_System SHALL provide a public API endpoint at `/api/profiles/@username`
2. THE Profile_System SHALL return profile data in JSON format
3. THE Profile_System SHALL include Profile_Data and Zap_Data in the API response
4. THE Profile_System SHALL respect privacy settings and return HTTP 404 for private profiles
5. THE Profile_System SHALL rate-limit API requests to 100 requests per IP address per hour
6. THE Profile_System SHALL include CORS headers to allow cross-origin requests
7. THE Profile_System SHALL cache API responses at the CDN edge for 60 seconds
8. THE Profile_System SHALL document the API schema in OpenAPI 3.0 format
