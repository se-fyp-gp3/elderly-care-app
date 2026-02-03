# Elderly Use Case Descriptions

This document details the use cases for the **Elderly** actor based on the updated system architecture.

## 1. Authentication

### UC-01: Register Account

| Field | Content |
| :--- | :--- |
| **Use case name** | Register Account |
| **Use case ID** | UC-01 |
| **Super use case** | / |
| **Actor(s)** | Elderly, Public User |
| **Brief description** | A new user creates an account to access the system, selecting their identity (Elderly) and setting up credentials. |
| **Preconditions** | User has the application installed and is not logged in. |
| **Post-conditions** | A new `User` document and `Elderly` profile are created in the database. Session is established. |
| **Flow of events** | 1. User opens app and taps "Sign Up".<br>2. System displays identity selection (Elderly/Caregiver).<br>3. User selects "Elderly".<br>4. User enters Email, Password, and Name.<br>5. User taps "Create Account".<br>6. System calls `account.create` API.<br>7. System creates `Elderly` profile in database (`createElderlyProfile`).<br>8. System automatically logs user in. |
| **Alternative flows and exceptions** | **E1: Email already exists**<br>System returns 409 error. UI displays "User already exists".<br>**A1: Google Register**<br>User taps "Sign in with Google". System initiates OAuth flow. |
| **Priority** | High |
| **Non-behavioral requirements** | Passwords must be hashed. Profile creation must happen atomically with account creation. |
| **Assumptions** | Internet connection is available. |
| **Issues** | None |
| **Source** | System Architecture |

### UC-02: Login

| Field | Content |
| :--- | :--- |
| **Use case name** | Login |
| **Use case ID** | UC-02 |
| **Super use case** | / |
| **Actor(s)** | Elderly, Caregiver |
| **Brief description** | Existing user authenticates to access their dashboard. |
| **Preconditions** | Account exists. |
| **Post-conditions** | valid session token stored on device. User routed to role-specific Home. |
| **Flow of events** | 1. User enters Email and Password.<br>2. User taps "Sign In".<br>3. System calls `account.createEmailPasswordSession`.<br>4. System fetches User Preferences (`getPrefs`) to determine role.<br>5. System routes to `(elderly-tabs)` layout. |
| **Alternative flows and exceptions** | **E1: Invalid Credentials**<br>System shows "Invalid email or password". |
| **Priority** | High |
| **Non-behavioral requirements** | Secure token storage. |
| **Assumptions** | / |
| **Issues** | / |
| **Source** | System Architecture |

## 2. Core Features

### UC-03: View Dashboard

| Field | Content |
| :--- | :--- |
| **Use case name** | View Dashboard |
| **Use case ID** | UC-03 |
| **Super use case** | / |
| **Actor(s)** | Elderly |
| **Brief description** | User views an overview of their day, including upcoming meds, schedule, and quick actions. |
| **Preconditions** | User is logged in. |
| **Post-conditions** | Data is fetched and rendered. |
| **Flow of events** | 1. System calls `getElderlyByUserId` to fetch profile name.<br>2. System calls `fetchElderlyMedicationsForUser` to get adherence status.<br>3. System calls `fetchElderlySchedulesForUser` to get calendar events.<br>4. UI renders "Welcome" card, "Steps Today", and "Quick Actions" grid.<br>5. UI renders filtered lists of today's pending items. |
| **Alternative flows and exceptions** | **A1: No Data**<br>Ui displays "No medications scheduled" or "No upcoming events" placeholders. |
| **Priority** | High |
| **Non-behavioral requirements** | Load time < 2 seconds. |
| **Assumptions** | / |
| **Issues** | / |
| **Source** | System Architecture |

### UC-04: Manage Medications

| Field | Content |
| :--- | :--- |
| **Use case name** | Manage Medications |
| **Use case ID** | UC-04 |
| **Super use case** | / |
| **Actor(s)** | Elderly, Caregiver |
| **Brief description** | User views, adds, or interacts with their medication list. |
| **Preconditions** | User is on Medication Screen. |
| **Post-conditions** | Medication list is updated. |
| **Flow of events** | 1. System calls `fetchActiveMedicationReminders`.<br>2. System calls `fetchDailyMedicationLogs` for current date.<br>3. UI merges Reminders with Logs to determine "Pending", "Taken", or "Missed" status.<br>4. List is sorted by time (Morning -> Evening). |
| **Alternative flows and exceptions** | **A1: Add Medication (Extend)**<br>See UC-04a.<br>**A2: Log Intake (Extend)**<br>See UC-04b. |
| **Priority** | High |
| **Non-behavioral requirements** | Sync with server must be reliable. |
| **Assumptions** | / |
| **Issues** | / |
| **Source** | System Architecture |

#### UC-04a: Add Medication (Extend)

| Field | Content |
| :--- | :--- |
| **Use case name** | Add Medication |
| **Use case ID** | UC-04a |
| **Super use case** | Manage Medications |
| **Actor(s)** | Elderly |
| **Brief description** | User manually inputs a new medication prescription. |
| **Preconditions** | User is on Medication Screen. |
| **Post-conditions** | New `ElderlyMedication` and `ElderlyMedicationReminder` records created. |
| **Flow of events** | 1. User taps FAB (+).<br>2. User inputs Name, Dosage, Frequency, Times.<br>3. User controls Notification toggle.<br>4. User taps "Save".<br>5. System calls `createElderlyMedicationWithReminder`.<br>6. System schedules local push notification (`scheduleMedicationNotification`). |
| **Alternative flows and exceptions** | / |
| **Priority** | Medium |
| **Non-behavioral requirements** | / |
| **Assumptions** | / |
| **Issues** | / |
| **Source** | System Architecture |

#### UC-04b: Log Intake (Extend/Include)

| Field | Content |
| :--- | :--- |
| **Use case name** | Log Intake |
| **Use case ID** | UC-04b |
| **Super use case** | Manage Medications, View Dashboard |
| **Actor(s)** | Elderly |
| **Brief description** | User marks a medication as taken. |
| **Preconditions** | A pending medication reminder exists. |
| **Post-conditions** | `MedicationLog` created with status 'taken'. |
| **Flow of events** | 1. User taps "Take" checkbox on card.<br>2. System calls `logMedicationAction(reminderId, 'taken')`.<br>3. System creates `MedicationLog` in database.<br>4. UI updates status to "Completed" and moves item to history. |
| **Alternative flows and exceptions** | **A1: Skip**<br>User swipes to Skip. Log created with status 'skipped'. |
| **Priority** | High |
| **Non-behavioral requirements** | Immediate UI feedback required. |
| **Assumptions** | / |
| **Issues** | / |
| **Source** | System Architecture |

### UC-05: Trigger Emergency

| Field | Content |
| :--- | :--- |
| **Use case name** | Trigger Emergency |
| **Use case ID** | UC-05 |
| **Super use case** | / |
| **Actor(s)** | Elderly |
| **Brief description** | User quickly dials emergency services or Community support. |
| **Preconditions** | App is open. |
| **Post-conditions** | Phone dialer launched. |
| **Flow of events** | 1. User navigates to "Community" (formerly Emergency) tab or taps Home SOS button.<br>2. User taps large Red "Call 999" button.<br>3. System calls `Linking.openURL('tel:999')`.<br>4. Native OS dialer opens. |
| **Alternative flows and exceptions** | **A1: Call Extended Contact**<br>User selects logic from contact list. |
| **Priority** | Critical |
| **Non-behavioral requirements** | Button must be large and accessible. |
| **Assumptions** | Device has telephony capabilities. |
| **Issues** | / |
| **Source** | System Architecture |

### UC-06: Chat with AI

| Field | Content |
| :--- | :--- |
| **Use case name** | Chat with AI |
| **Use case ID** | UC-06 |
| **Super use case** | / |
| **Actor(s)** | Elderly |
| **Brief description** | User converses with an AI assistant for health queries or companionship. |
| **Preconditions** | Internet active. |
| **Post-conditions** | Chat history updated. |
| **Flow of events** | 1. User opens Chat tab.<br>2. User types message or speaks.<br>3. System sends input to AI Service.<br>4. System streams response to UI.<br>5. `ChatSession` updated in database. |
| **Alternative flows and exceptions** | **A1: Send Photo**<br>User selects image. Image analyzed by vision model.<br>**A2: Ask Quick Question**<br>User selects predefined prompt chip. |
| **Priority** | Medium |
| **Non-behavioral requirements** | Response time < 5s. |
| **Assumptions** | / |
| **Issues** | / |
| **Source** | System Architecture |

### UC-07: View Schedule

| Field | Content |
| :--- | :--- |
| **Use case name** | View Schedule |
| **Use case ID** | UC-07 |
| **Super use case** | / |
| **Actor(s)** | Elderly |
| **Brief description** | View calendar events (non-medication). |
| **Preconditions** | / |
| **Post-conditions** | / |
| **Flow of events** | 1. User navigates to Schedule tab.<br>2. System queries `schedule` collection by date.<br>3. List displays titles, times, and descriptions. |
| **Alternative flows and exceptions** | / |
| **Priority** | Low |
| **Non-behavioral requirements** | / |
| **Assumptions** | / |
| **Issues** | / |
| **Source** | System Architecture |
