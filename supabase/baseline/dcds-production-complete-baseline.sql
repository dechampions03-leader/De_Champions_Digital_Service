SET local check_function_bodies = off;

CREATE TABLE "public"."admin_users" (
  "user_id"    uuid                     NOT NULL,
  "role"       text                     NOT NULL DEFAULT 'admin'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_users_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "admin_users_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'super_admin'::text])))
);

ALTER TABLE "public"."admin_users"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."admin_users" FROM "anon", "authenticated";

CREATE TABLE "public"."assignment_submissions" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id"      uuid                     NOT NULL,
  "user_id"            uuid                     NOT NULL,
  "submission_text"    text,
  "submission_url"     text,
  "original_file_name" text,
  "status"             text                     NOT NULL DEFAULT 'submitted'::text,
  "submitted_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "score"              numeric(8,2),
  "feedback"           text,
  "graded_by"          uuid,
  "graded_at"          timestamp with time zone,
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "assignment_submissions_assignment_id_user_id_key" UNIQUE (assignment_id, user_id),
  CONSTRAINT "assignment_submissions_check" CHECK (((submission_text IS NOT NULL) OR (submission_url IS NOT NULL))),
  CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "assignment_submissions_status_check" CHECK ((status = ANY (ARRAY['submitted'::text, 'late'::text, 'graded'::text, 'returned'::text])))
);

ALTER TABLE "public"."assignment_submissions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."assignment_submissions" FROM "anon";

CREATE TABLE "public"."assignments" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "course_id"              uuid                     NOT NULL,
  "title"                  text                     NOT NULL,
  "description"            text                     NOT NULL,
  "instructions"           text,
  "status"                 text                     NOT NULL DEFAULT 'draft'::text,
  "due_at"                 timestamp with time zone,
  "max_score"              numeric(8,2)             NOT NULL DEFAULT 100,
  "allow_late_submissions" boolean                  NOT NULL DEFAULT false,
  "created_by"             uuid,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "assignments_max_score_check" CHECK ((max_score > (0)::numeric)),
  CONSTRAINT "assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "assignments_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT "assignments_title_check" CHECK (((length(TRIM(BOTH FROM title)) >= 3) AND (length(TRIM(BOTH FROM title)) <= 180)))
);

ALTER TABLE "public"."assignments"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."assignments" FROM "anon";

CREATE TABLE "public"."certificates" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "certificate_number"        text                     NOT NULL,
  "user_id"                   uuid                     NOT NULL,
  "course_id"                 uuid                     NOT NULL,
  "status"                    text                     NOT NULL DEFAULT 'issued'::text,
  "issued_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "verified_at"               timestamp with time zone,
  "revoked_at"                timestamp with time zone,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "completion_policy_version" integer,
  "completed_lesson_count"    integer,
  "completion_snapshot"       jsonb,
  "completion_recorded_at"    timestamp with time zone,
  CONSTRAINT "certificates_certificate_number_key" UNIQUE (certificate_number),
  CONSTRAINT "certificates_pkey" PRIMARY KEY (id),
  CONSTRAINT "certificates_status_check" CHECK ((status = ANY (ARRAY['issued'::text, 'admin_verified'::text, 'revoked'::text]))),
  CONSTRAINT "certificates_user_id_course_id_key" UNIQUE (user_id, course_id)
);

ALTER TABLE "public"."certificates"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."course_lessons" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "course_id"          uuid                     NOT NULL,
  "lesson_title"       text                     NOT NULL,
  "lesson_description" text,
  "youtube_url"        text                     NOT NULL,
  "lesson_number"      integer                  NOT NULL,
  "created_at"         timestamp with time zone DEFAULT now(),
  CONSTRAINT "course_lessons_course_id_lesson_number_key" UNIQUE (course_id, lesson_number),
  CONSTRAINT "course_lessons_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."course_lessons"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."course_materials" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "course_id"        uuid                     NOT NULL,
  "material_title"   text                     NOT NULL,
  "material_type"    text                     DEFAULT 'PDF'::text,
  "google_drive_url" text                     NOT NULL,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "course_materials_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."course_materials"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."courses" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "slug"                      text                     NOT NULL,
  "title"                     text                     NOT NULL,
  "price"                     numeric(12,2)            NOT NULL,
  "currency"                  text                     DEFAULT 'NGN'::text,
  "created_at"                timestamp with time zone DEFAULT now(),
  "completion_policy_version" integer                  NOT NULL DEFAULT 1,
  CONSTRAINT "courses_pkey" PRIMARY KEY (id),
  CONSTRAINT "courses_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."courses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."dcds_admins" (
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_admins_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."dcds_admins"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."dcds_ambassadors" (
  "user_id"       uuid                     NOT NULL,
  "referral_code" text                     NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'pending'::text,
  "activated_at"  timestamp with time zone,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_ambassadors_activation_consistency"
    CHECK ((((status = 'pending'::text) AND (activated_at IS NULL)) OR ((status = ANY (ARRAY['active'::text, 'suspended'::text])) AND (activated_at IS NOT NULL)))),
  CONSTRAINT "dcds_ambassadors_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "dcds_ambassadors_referral_code_format" CHECK ((referral_code ~ '^[A-Z0-9]{6,16}$'::text)),
  CONSTRAINT "dcds_ambassadors_referral_code_key" UNIQUE (referral_code),
  CONSTRAINT "dcds_ambassadors_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text])))
);

ALTER TABLE "public"."dcds_ambassadors"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_ambassadors" FROM "anon";

CREATE TABLE "public"."dcds_general_course_channels" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "channel_number" integer                  NOT NULL,
  "channel_name"   text                     NOT NULL,
  "invite_url"     text                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_general_course_channels_channel_number_check" CHECK (((channel_number >= 1) AND (channel_number <= 4))),
  CONSTRAINT "dcds_general_course_channels_channel_number_key" UNIQUE (channel_number),
  CONSTRAINT "dcds_general_course_channels_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."dcds_general_course_channels"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_general_course_channels" FROM "anon", "authenticated";

CREATE TABLE "public"."dcds_payout_accounts" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                   uuid                     NOT NULL,
  "bank_code"                 text                     NOT NULL,
  "bank_name"                 text                     NOT NULL,
  "account_name"              text                     NOT NULL,
  "account_number_ciphertext" text                     NOT NULL,
  "account_number_last4"      text                     NOT NULL,
  "verification_status"       text                     NOT NULL DEFAULT 'pending'::text,
  "verified_at"               timestamp with time zone,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_payout_accounts_account_number_last4_check" CHECK ((account_number_last4 ~ '^[0-9]{4}$'::text)),
  CONSTRAINT "dcds_payout_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "dcds_payout_accounts_user_id_key" UNIQUE (user_id),
  CONSTRAINT "dcds_payout_accounts_verification_status_check" CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])))
);

ALTER TABLE "public"."dcds_payout_accounts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_payout_accounts" FROM "anon", "authenticated";

CREATE TABLE "public"."dcds_payout_events" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "payout_request_id" uuid                     NOT NULL,
  "user_id"           uuid                     NOT NULL,
  "event_type"        text                     NOT NULL,
  "amount"            numeric(12,2)            NOT NULL,
  "currency"          text                     NOT NULL DEFAULT 'NGN'::text,
  "actor_user_id"     uuid,
  "details"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_payout_events_amount_check" CHECK ((amount >= (5000)::numeric)),
  CONSTRAINT "dcds_payout_events_currency_check" CHECK ((currency = 'NGN'::text)),
  CONSTRAINT "dcds_payout_events_event_type_check"
    CHECK ((event_type = ANY (ARRAY['requested'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'manual_review'::text]))),
  CONSTRAINT "dcds_payout_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."dcds_payout_events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_payout_events" FROM "anon", "authenticated";

CREATE TABLE "public"."dcds_payout_requests" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              uuid                     NOT NULL,
  "payout_account_id"    uuid                     NOT NULL,
  "amount"               numeric(12,2)            NOT NULL,
  "currency"             text                     NOT NULL DEFAULT 'NGN'::text,
  "status"               text                     NOT NULL DEFAULT 'requested'::text,
  "transfer_reference"   text,
  "provider_transfer_id" text,
  "failure_reason"       text,
  "requested_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at"         timestamp with time zone,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_payout_requests_amount_check" CHECK ((amount >= 5000.00)),
  CONSTRAINT "dcds_payout_requests_currency_check" CHECK ((currency = 'NGN'::text)),
  CONSTRAINT "dcds_payout_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "dcds_payout_requests_provider_transfer_id_key" UNIQUE (provider_transfer_id),
  CONSTRAINT "dcds_payout_requests_status_check" CHECK ((status = ANY (ARRAY['requested'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "dcds_payout_requests_transfer_reference_key" UNIQUE (transfer_reference)
);

ALTER TABLE "public"."dcds_payout_requests"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_payout_requests" FROM "anon";

CREATE TABLE "public"."dcds_referrals" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "referrer_user_id" uuid                     NOT NULL,
  "referred_user_id" uuid                     NOT NULL,
  "referral_code"    text                     NOT NULL,
  "referred_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "status"           text                     NOT NULL DEFAULT 'attributed'::text,
  "qualified_at"     timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_referrals_no_self_referral" CHECK ((referrer_user_id <> referred_user_id)),
  CONSTRAINT "dcds_referrals_pkey" PRIMARY KEY (id),
  CONSTRAINT "dcds_referrals_referred_user_id_key" UNIQUE (referred_user_id),
  CONSTRAINT "dcds_referrals_status_check" CHECK ((status = ANY (ARRAY['attributed'::text, 'qualified'::text, 'blocked'::text])))
);

ALTER TABLE "public"."dcds_referrals"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_referrals" FROM "anon";

CREATE TABLE "public"."dcds_reviews" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "display_name" text                     NOT NULL,
  "course_title" text                     NOT NULL,
  "rating"       integer                  NOT NULL,
  "review_text"  text                     NOT NULL,
  "is_approved"  boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_reviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "dcds_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)))
);

ALTER TABLE "public"."dcds_reviews"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."dcds_reward_events" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reward_ledger_id"   uuid                     NOT NULL,
  "order_id"           uuid                     NOT NULL,
  "ambassador_user_id" uuid                     NOT NULL,
  "event_type"         text                     NOT NULL,
  "amount"             numeric(12,2)            NOT NULL,
  "currency"           text                     NOT NULL DEFAULT 'NGN'::text,
  "reason"             text                     NOT NULL,
  "actor_user_id"      uuid,
  "details"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dcds_reward_events_currency_check" CHECK ((currency = 'NGN'::text)),
  CONSTRAINT "dcds_reward_events_event_type_check"
    CHECK ((event_type = ANY (ARRAY['reward_reversed'::text, 'recovery_due'::text, 'recovery_collected'::text, 'manual_review'::text]))),
  CONSTRAINT "dcds_reward_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."dcds_reward_events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_reward_events" FROM "anon", "authenticated";

CREATE TABLE "public"."dcds_reward_ledger" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "ambassador_user_id" uuid                     NOT NULL,
  "referred_user_id"   uuid                     NOT NULL,
  "order_id"           uuid                     NOT NULL,
  "course_id"          uuid                     NOT NULL,
  "amount"             numeric(12,2)            NOT NULL DEFAULT 1000.00,
  "currency"           text                     NOT NULL DEFAULT 'NGN'::text,
  "status"             text                     NOT NULL DEFAULT 'pending'::text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "available_at"       timestamp with time zone,
  "reversed_at"        timestamp with time zone,
  "reversal_reason"    text,
  "payout_request_id"  uuid,
  CONSTRAINT "dcds_reward_ledger_amount_check" CHECK ((amount = 1000.00)),
  CONSTRAINT "dcds_reward_ledger_currency_check" CHECK ((currency = 'NGN'::text)),
  CONSTRAINT "dcds_reward_ledger_order_id_key" UNIQUE (order_id),
  CONSTRAINT "dcds_reward_ledger_pkey" PRIMARY KEY (id),
  CONSTRAINT "dcds_reward_ledger_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'available'::text, 'held'::text, 'reversed'::text, 'paid'::text]))),
  CONSTRAINT "dcds_reward_one_per_referred_course" UNIQUE (referred_user_id, course_id)
);

ALTER TABLE "public"."dcds_reward_ledger"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dcds_reward_ledger" FROM "anon";

CREATE TABLE "public"."enrollments" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           uuid                     NOT NULL,
  "course_id"         uuid                     NOT NULL,
  "order_id"          uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "enrollment_source" text                     NOT NULL DEFAULT 'purchase'::text,
  CONSTRAINT "enrollments_enrollment_source_check" CHECK ((enrollment_source = ANY (ARRAY['purchase'::text, 'admin_grant'::text]))),
  CONSTRAINT "enrollments_order_id_key" UNIQUE (order_id),
  CONSTRAINT "enrollments_pkey" PRIMARY KEY (id),
  CONSTRAINT "enrollments_user_id_course_id_key" UNIQUE (user_id, course_id)
);

ALTER TABLE "public"."enrollments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."lesson_progress" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "course_id"    uuid                     NOT NULL,
  "lesson_id"    uuid                     NOT NULL,
  "completed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lesson_progress_pkey" PRIMARY KEY (id),
  CONSTRAINT "lesson_progress_user_id_lesson_id_key" UNIQUE (user_id, lesson_id)
);

ALTER TABLE "public"."lesson_progress"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notification_recipients" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "notification_id" uuid                     NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "read_at"         timestamp with time zone,
  "sms_status"      text                     NOT NULL DEFAULT 'pending'::text,
  "sms_error"       text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "is_read"         boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "notification_recipients_notification_id_user_id_key" UNIQUE (notification_id, user_id),
  CONSTRAINT "notification_recipients_pkey" PRIMARY KEY (id),
  CONSTRAINT "notification_recipients_sms_status_check" CHECK ((sms_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'not_requested'::text])))
);

ALTER TABLE "public"."notification_recipients"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notifications" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"            text                     NOT NULL,
  "message"          text                     NOT NULL,
  "category"         text                     NOT NULL DEFAULT 'general'::text,
  "created_by"       uuid                     NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "audience"         text                     DEFAULT 'all'::text,
  "course_id"        uuid,
  "delivery_channel" text,
  CONSTRAINT "notifications_category_check"
    CHECK
    ((category = ANY (ARRAY['announcement'::text, 'course_update'::text, 'learning_material'::text, 'important'::text, 'maintenance'::text, 'promotion'::text, 'general'::text,
    'course'::text, 'event'::text]))),
  CONSTRAINT "notifications_delivery_channel_check" CHECK (((delivery_channel IS NULL) OR (delivery_channel = ANY (ARRAY['notification'::text, 'ticker'::text])))),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."orders" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "course_id"  uuid                     NOT NULL,
  "amount"     numeric(12,2)            NOT NULL,
  "currency"   text                     NOT NULL DEFAULT 'NGN'::text,
  "status"     text                     NOT NULL DEFAULT 'pending'::text,
  "tx_ref"     text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "orders_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "orders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'successful'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "orders_tx_ref_key" UNIQUE (tx_ref)
);

ALTER TABLE "public"."orders"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payments" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"       uuid                     NOT NULL,
  "user_id"        uuid                     NOT NULL,
  "provider"       text                     NOT NULL DEFAULT 'flutterwave'::text,
  "transaction_id" text,
  "tx_ref"         text,
  "amount"         numeric(12,2)            NOT NULL,
  "currency"       text                     NOT NULL DEFAULT 'NGN'::text,
  "status"         text                     NOT NULL DEFAULT 'pending'::text,
  "raw_response"   jsonb,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "payments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'successful'::text, 'failed'::text]))),
  CONSTRAINT "payments_transaction_id_key" UNIQUE (transaction_id),
  CONSTRAINT "payments_tx_ref_key" UNIQUE (tx_ref)
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"          bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "name"        text   NOT NULL DEFAULT ''::text,
  "email"       text   NOT NULL,
  "timestamptz" text   NOT NULL,
  "phone"       text,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."profiles" FROM "anon", "authenticated";

CREATE TABLE "public"."public_announcements" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"      text                     NOT NULL,
  "message"    text                     NOT NULL,
  "image_url"  text,
  "status"     text                     NOT NULL DEFAULT 'draft'::text,
  "starts_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "public_announcements_message_check" CHECK (((char_length(TRIM(BOTH FROM message)) >= 1) AND (char_length(TRIM(BOTH FROM message)) <= 10000))),
  CONSTRAINT "public_announcements_pkey" PRIMARY KEY (id),
  CONSTRAINT "public_announcements_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'inactive'::text]))),
  CONSTRAINT "public_announcements_title_check" CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 150))),
  CONSTRAINT "public_announcements_valid_schedule" CHECK (((expires_at IS NULL) OR (expires_at > starts_at)))
);

ALTER TABLE "public"."public_announcements"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."public_announcements" FROM "anon";

CREATE TABLE "public"."quiz_answer_keys" (
  "question_id"    uuid                     NOT NULL,
  "correct_answer" text                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quiz_answer_keys_pkey" PRIMARY KEY (question_id)
);

ALTER TABLE "public"."quiz_answer_keys"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."quiz_answer_keys" FROM "anon";

CREATE TABLE "public"."quiz_attempt_answers" (
  "id"             uuid         NOT NULL DEFAULT gen_random_uuid(),
  "attempt_id"     uuid         NOT NULL,
  "question_id"    uuid         NOT NULL,
  "answer"         text,
  "is_correct"     boolean,
  "points_awarded" numeric(8,2) NOT NULL DEFAULT 0,
  CONSTRAINT "quiz_attempt_answers_attempt_id_question_id_key" UNIQUE (attempt_id, question_id),
  CONSTRAINT "quiz_attempt_answers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."quiz_attempt_answers"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."quiz_attempt_answers" FROM "anon";

CREATE TABLE "public"."quiz_attempts" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "quiz_id"        uuid                     NOT NULL,
  "user_id"        uuid                     NOT NULL,
  "attempt_number" integer                  NOT NULL,
  "status"         text                     NOT NULL DEFAULT 'in_progress'::text,
  "started_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "submitted_at"   timestamp with time zone,
  "score"          numeric(8,2),
  "total_points"   numeric(8,2),
  "percentage"     numeric(5,2),
  "passed"         boolean,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quiz_attempts_attempt_number_check" CHECK ((attempt_number > 0)),
  CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY (id),
  CONSTRAINT "quiz_attempts_quiz_id_user_id_attempt_number_key" UNIQUE (quiz_id, user_id, attempt_number),
  CONSTRAINT "quiz_attempts_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'graded'::text, 'expired'::text])))
);

ALTER TABLE "public"."quiz_attempts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."quiz_attempts" FROM "anon";

CREATE TABLE "public"."quiz_questions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "quiz_id"       uuid                     NOT NULL,
  "question_text" text                     NOT NULL,
  "question_type" text                     NOT NULL DEFAULT 'multiple_choice'::text,
  "options"       jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "points"        numeric(8,2)             NOT NULL DEFAULT 1,
  "sort_order"    integer                  NOT NULL DEFAULT 0,
  "explanation"   text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quiz_questions_options_check" CHECK (((jsonb_typeof(options) = 'array'::text) AND (jsonb_array_length(options) >= 2))),
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY (id),
  CONSTRAINT "quiz_questions_points_check" CHECK ((points > (0)::numeric)),
  CONSTRAINT "quiz_questions_question_text_check" CHECK ((length(TRIM(BOTH FROM question_text)) > 0)),
  CONSTRAINT "quiz_questions_question_type_check" CHECK ((question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text])))
);

ALTER TABLE "public"."quiz_questions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."quiz_questions" FROM "anon";

CREATE TABLE "public"."quizzes" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "course_id"          uuid                     NOT NULL,
  "title"              text                     NOT NULL,
  "description"        text,
  "instructions"       text,
  "status"             text                     NOT NULL DEFAULT 'draft'::text,
  "time_limit_seconds" integer,
  "max_attempts"       integer                  NOT NULL DEFAULT 1,
  "pass_mark"          numeric(5,2)             NOT NULL DEFAULT 50,
  "available_from"     timestamp with time zone,
  "available_until"    timestamp with time zone,
  "created_by"         uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quizzes_check" CHECK (((available_until IS NULL) OR (available_from IS NULL) OR (available_until > available_from))),
  CONSTRAINT "quizzes_max_attempts_check" CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
  CONSTRAINT "quizzes_pass_mark_check" CHECK (((pass_mark >= (0)::numeric) AND (pass_mark <= (100)::numeric))),
  CONSTRAINT "quizzes_pkey" PRIMARY KEY (id),
  CONSTRAINT "quizzes_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT "quizzes_time_limit_seconds_check" CHECK (((time_limit_seconds IS NULL) OR ((time_limit_seconds >= 60) AND (time_limit_seconds <= 86400)))),
  CONSTRAINT "quizzes_title_check" CHECK (((length(TRIM(BOTH FROM title)) >= 3) AND (length(TRIM(BOTH FROM title)) <= 180)))
);

ALTER TABLE "public"."quizzes"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."quizzes" FROM "anon";

CREATE TABLE "public"."student_admin_audit" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "student_id" uuid                     NOT NULL,
  "admin_id"   uuid                     NOT NULL,
  "action"     text                     NOT NULL,
  "details"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "student_admin_audit_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."student_admin_audit"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."student_admin_audit" FROM "anon", "authenticated";

CREATE TABLE "public"."student_admin_notes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "student_id" uuid                     NOT NULL,
  "note"       text                     NOT NULL,
  "created_by" uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "student_admin_notes_note_check" CHECK (((char_length(TRIM(BOTH FROM note)) >= 2) AND (char_length(TRIM(BOTH FROM note)) <= 3000))),
  CONSTRAINT "student_admin_notes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."student_admin_notes"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."student_admin_notes" FROM "anon", "authenticated";

CREATE TABLE "public"."student_reviews" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "student_id"   uuid                     NOT NULL,
  "student_name" text                     NOT NULL,
  "course_name"  text                     NOT NULL,
  "rating"       integer                  NOT NULL,
  "review_text"  text                     NOT NULL,
  "is_approved"  boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "student_reviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "student_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)))
);

ALTER TABLE "public"."student_reviews"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."student_support_tickets" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid                     NOT NULL,
  "subject"        text                     NOT NULL,
  "category"       text                     NOT NULL DEFAULT 'general'::text,
  "message"        text                     NOT NULL,
  "status"         text                     NOT NULL DEFAULT 'open'::text,
  "admin_response" text,
  "responded_by"   uuid,
  "responded_at"   timestamp with time zone,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "student_support_tickets_category_check"
    CHECK ((category = ANY (ARRAY['account'::text, 'course_access'::text, 'learning'::text, 'payment'::text, 'technical'::text, 'certificate'::text, 'general'::text]))),
  CONSTRAINT "student_support_tickets_message_check" CHECK (((char_length(TRIM(BOTH FROM message)) >= 10) AND (char_length(TRIM(BOTH FROM message)) <= 5000))),
  CONSTRAINT "student_support_tickets_pkey" PRIMARY KEY (id),
  CONSTRAINT "student_support_tickets_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]))),
  CONSTRAINT "student_support_tickets_subject_check" CHECK (((char_length(TRIM(BOTH FROM subject)) >= 5) AND (char_length(TRIM(BOTH FROM subject)) <= 150)))
);

ALTER TABLE "public"."student_support_tickets"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_add_student_note (
  p_student_id uuid,
  p_note       text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare note_id uuid;
begin
  if not coalesce(public.is_dcds_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_note is null or char_length(trim(p_note))<2 or char_length(trim(p_note))>3000 then
    raise exception 'Note must be between 2 and 3000 characters';
  end if;
  insert into public.student_admin_notes(student_id,note,created_by)
  values(p_student_id,trim(p_note),auth.uid()) returning id into note_id;
  insert into public.student_admin_audit(student_id,admin_id,action,details)
  values(p_student_id,auth.uid(),'admin_note_added',jsonb_build_object('note_id',note_id));
  return note_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_add_student_note"(uuid, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_enrol_student (
  p_student_id uuid,
  p_course_id  uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare enrollment_id uuid;
begin
  if not coalesce(public.is_dcds_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_student_id) then raise exception 'Student not found'; end if;
  if not exists(select 1 from public.courses where id=p_course_id) then raise exception 'Course not found'; end if;
  if exists(select 1 from public.enrollments where user_id=p_student_id and course_id=p_course_id) then
    raise exception 'Student is already enrolled in this course';
  end if;
  insert into public.enrollments(user_id,course_id,order_id,enrollment_source)
  values(p_student_id,p_course_id,null,'admin_grant') returning id into enrollment_id;
  insert into public.student_admin_audit(student_id,admin_id,action,details)
  values(p_student_id,auth.uid(),'manual_course_enrolment',jsonb_build_object('course_id',p_course_id,'enrollment_id',enrollment_id));
  return enrollment_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_enrol_student"(uuid, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_get_student_record (
  p_student_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'student', jsonb_build_object(
      'id',u.id,'email',u.email,
      'full_name',coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),nullif(btrim(u.raw_user_meta_data->>'name'),''),'DCDS Student'),
      'phone',coalesce(u.raw_user_meta_data->>'phone',''),
      'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,
      'email_confirmed_at',u.email_confirmed_at,'banned_until',u.banned_until,
      'user_metadata',u.raw_user_meta_data
    ),
    'enrolments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'course_id',c.id,'course_title',c.title,'course_price',c.price,
        'enrolled_at',e.created_at,'enrollment_source',e.enrollment_source
      ) order by e.created_at desc)
      from public.enrollments e join public.courses c on c.id=e.course_id where e.user_id=u.id
    ),'[]'::jsonb),
    'orders',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'course_title',c.title,'amount',o.amount,'currency',o.currency,
        'status',o.status,'tx_ref',o.tx_ref,'created_at',o.created_at
      ) order by o.created_at desc)
      from public.orders o join public.courses c on c.id=o.course_id where o.user_id=u.id
    ),'[]'::jsonb),
    'payments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'order_id',p.order_id,'provider',p.provider,
        'transaction_id',p.transaction_id,'tx_ref',p.tx_ref,'amount',p.amount,
        'currency',p.currency,'status',p.status,'created_at',p.created_at
      ) order by p.created_at desc)
      from public.payments p where p.user_id=u.id
    ),'[]'::jsonb),
    'progress',coalesce((
      select jsonb_agg(jsonb_build_object(
        'course_title',c.title,'lesson_title',l.lesson_title,
        'completed_at',lp.completed_at
      ) order by lp.completed_at desc)
      from public.lesson_progress lp
      join public.courses c on c.id=lp.course_id
      join public.course_lessons l on l.id=lp.lesson_id
      where lp.user_id=u.id
    ),'[]'::jsonb),
    'certificates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',cert.id,'certificate_number',cert.certificate_number,
        'course_title',c.title,'status',cert.status,
        'issued_at',cert.issued_at,'verified_at',cert.verified_at
      ) order by cert.issued_at desc)
      from public.certificates cert join public.courses c on c.id=cert.course_id
      where cert.user_id=u.id
    ),'[]'::jsonb),
    'support_tickets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'subject',t.subject,'category',t.category,'message',t.message,
        'status',t.status,'admin_response',t.admin_response,'created_at',t.created_at,
        'responded_at',t.responded_at
      ) order by t.created_at desc)
      from public.student_support_tickets t where t.user_id=u.id
    ),'[]'::jsonb),
    'admin_notes',coalesce((
      select jsonb_agg(jsonb_build_object('id',n.id,'note',n.note,'created_at',n.created_at)
      order by n.created_at desc)
      from public.student_admin_notes n where n.student_id=u.id
    ),'[]'::jsonb),
    'audit_log',coalesce((
      select jsonb_agg(jsonb_build_object('action',a.action,'details',a.details,'created_at',a.created_at)
      order by a.created_at desc)
      from public.student_admin_audit a where a.student_id=u.id
    ),'[]'::jsonb)
  ) into result
  from auth.users u where u.id=p_student_id;
  if result is null then raise exception 'Student not found'; end if;
  return result;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_get_student_record"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_list_students (
  p_search text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
  RETURNS TABLE (
    user_id                 uuid,
    email                   text,
    full_name               text,
    phone                   text,
    account_created_at      timestamp with time zone,
    last_sign_in_at         timestamp with time zone,
    email_confirmed_at      timestamp with time zone,
    enrollment_count        bigint,
    successful_order_count  bigint,
    total_successful_amount numeric,
    enrolled_courses        jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth', 'pg_temp'
  AS $function$
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'DCDS Student'
    )::text,
    nullif(btrim(u.raw_user_meta_data ->> 'phone'), '')::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    coalesce(en.enrollment_count, 0)::bigint,
    coalesce(ord.successful_order_count, 0)::bigint,
    coalesce(ord.total_successful_amount, 0)::numeric,
    coalesce(en.enrolled_courses, '[]'::jsonb)
  from auth.users u
  left join lateral (
    select
      count(*)::bigint as enrollment_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'course_id', c.id,
            'course_title', c.title,
            'enrolled_at', e.created_at
          )
          order by e.created_at desc
        ),
        '[]'::jsonb
      ) as enrolled_courses
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.user_id = u.id
  ) en on true
  left join lateral (
    select
      count(*) filter (where o.status = 'successful')::bigint as successful_order_count,
      coalesce(sum(o.amount) filter (where o.status = 'successful'), 0)::numeric as total_successful_amount
    from public.orders o
    where o.user_id = u.id
  ) ord on true
  where
    p_search is null
    or btrim(p_search) = ''
    or lower(
      coalesce(u.email, '') || ' ' ||
      coalesce(u.raw_user_meta_data ->> 'full_name', '') || ' ' ||
      coalesce(u.raw_user_meta_data ->> 'name', '') || ' ' ||
      coalesce(u.raw_user_meta_data ->> 'phone', '')
    ) like '%' || lower(btrim(p_search)) || '%'
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_list_students"(text, integer, integer) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_remove_student_enrolment (
  p_enrollment_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare sid uuid; src text;
begin
  if not coalesce(public.is_dcds_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select user_id,enrollment_source into sid,src from public.enrollments where id=p_enrollment_id;
  if sid is null then raise exception 'Enrolment not found'; end if;
  if src <> 'admin_grant' then
    raise exception 'Purchased enrolments cannot be removed here. Review the verified payment/order record instead.';
  end if;
  delete from public.enrollments where id=p_enrollment_id;
  insert into public.student_admin_audit(student_id,admin_id,action,details)
  values(sid,auth.uid(),'manual_course_enrolment_removed',jsonb_build_object('enrollment_id',p_enrollment_id));
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_remove_student_enrolment"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_set_student_access (
  p_student_id uuid,
  p_suspended  boolean
)
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare until_time timestamptz;
begin
  if not coalesce(public.is_dcds_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_suspended then until_time := now() + interval '100 years'; else until_time := null; end if;
  update auth.users set banned_until=until_time, updated_at=now() where id=p_student_id;
  if not found then raise exception 'Student not found'; end if;
  insert into public.student_admin_audit(student_id,admin_id,action,details)
  values(p_student_id,auth.uid(),case when p_suspended then 'account_suspended' else 'account_reactivated' end,
    jsonb_build_object('suspended',p_suspended));
  return until_time;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_set_student_access"(uuid, boolean) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_update_student_profile (
  p_student_id uuid,
  p_full_name  text,
  p_phone      text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not coalesce(public.is_dcds_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_full_name is null or char_length(trim(p_full_name))<2 or char_length(trim(p_full_name))>120 then
    raise exception 'Enter a valid student name';
  end if;
  if p_phone is not null and char_length(trim(p_phone))>30 then
    raise exception 'Phone number is too long';
  end if;
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb)
    || jsonb_build_object('full_name',trim(p_full_name),'name',trim(p_full_name),'phone',coalesce(trim(p_phone),'')),
      updated_at=now()
  where id=p_student_id;
  if not found then raise exception 'Student not found'; end if;
  insert into public.student_admin_audit(student_id,admin_id,action,details)
  values(p_student_id,auth.uid(),'profile_updated',jsonb_build_object('full_name',trim(p_full_name),'phone_updated',true));
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_update_student_profile"(uuid, text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.auto_issue_course_certificate()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
    PERFORM public.issue_course_certificate(NEW.course_id);

        RETURN NEW;

        EXCEPTION
            WHEN OTHERS THEN
                    RAISE WARNING 'Certificate issuance pending: %', SQLERRM;
                            RETURN NEW;
                            END;
                            $function$;

REVOKE ALL ON FUNCTION "public"."auto_issue_course_certificate"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.bump_course_completion_policy_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.courses
      SET completion_policy_version = completion_policy_version + 1
      WHERE id = NEW.course_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.courses
      SET completion_policy_version = completion_policy_version + 1
      WHERE id = OLD.course_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.course_id IS DISTINCT FROM NEW.course_id THEN
    UPDATE public.courses
      SET completion_policy_version = completion_policy_version + 1
      WHERE id IN (OLD.course_id, NEW.course_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."bump_course_completion_policy_version"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.capture_dcds_referral_on_signup()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  submitted_code text;
begin
  submitted_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'dcds_referral_code', '')));

  if submitted_code = '' or new.id is null then
    return new;
  end if;

  insert into public.dcds_referrals (
    referrer_user_id,
    referred_user_id,
    referral_code,
    status
  )
  select
    a.user_id,
    new.id,
    a.referral_code,
    'attributed'
  from public.dcds_ambassadors a
  where a.referral_code = submitted_code
    and a.status = 'active'
    and a.user_id <> new.id
  on conflict (referred_user_id) do nothing;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."capture_dcds_referral_on_signup"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.dcds_create_payout_request (
  p_user_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_account public.dcds_payout_accounts%rowtype;
  v_ambassador public.dcds_ambassadors%rowtype;
  v_amount numeric(12,2);
  v_request_id uuid;
  v_reference text;
  v_existing uuid;
begin
  if p_user_id is null then raise exception 'User identity is required.'; end if;

  select * into v_ambassador from public.dcds_ambassadors
  where user_id=p_user_id for update;
  if not found or v_ambassador.status <> 'active' then
    raise exception 'Active ambassador status is required.';
  end if;

  select * into v_account from public.dcds_payout_accounts
  where user_id=p_user_id for update;
  if not found or v_account.verification_status <> 'verified' then
    raise exception 'A verified payout bank account is required.';
  end if;

  select id into v_existing from public.dcds_payout_requests
  where user_id=p_user_id and status in ('requested','processing')
  limit 1 for update;
  if found then raise exception 'You already have a payout request being processed.'; end if;

  select coalesce(sum(amount),0)::numeric(12,2) into v_amount
  from public.dcds_reward_ledger
  where ambassador_user_id=p_user_id and status='available' and payout_request_id is null;
  if v_amount < 5000 then
    raise exception 'Your available reward balance has not reached the ₦5,000 minimum.';
  end if;

  v_request_id:=gen_random_uuid();
  v_reference:='DCDS-PAYOUT-'||upper(replace(v_request_id::text,'-',''));
  insert into public.dcds_payout_requests
    (id,user_id,payout_account_id,amount,currency,status,transfer_reference)
  values (v_request_id,p_user_id,v_account.id,v_amount,'NGN','requested',v_reference);

  update public.dcds_reward_ledger
  set status='held',payout_request_id=v_request_id
  where ambassador_user_id=p_user_id and status='available' and payout_request_id is null;
  if not found then raise exception 'No available rewards could be reserved.'; end if;

  return jsonb_build_object('request_id',v_request_id,'amount',v_amount,'currency','NGN',
    'status','requested','transfer_reference',v_reference,
    'account_last4',v_account.account_number_last4,'bank_name',v_account.bank_name);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."dcds_create_payout_request"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.dcds_log_payout_request_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  insert into public.dcds_payout_events
    (payout_request_id,user_id,event_type,amount,currency,actor_user_id,details)
  values
    (new.id,new.user_id,'requested',new.amount,new.currency,new.user_id,
     jsonb_build_object('bank_account_last4',
       (select account_number_last4 from public.dcds_payout_accounts where id=new.payout_account_id)));
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."dcds_log_payout_request_event"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.dcds_public_announcements_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
  AS $function$
                                                                                            BEGIN
                                                                                                NEW.updated_at := NOW();
                                                                                                    RETURN NEW;
                                                                                                    END;
                                                                                                    $function$;

CREATE OR REPLACE FUNCTION public.dcds_reject_payout_event_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  raise exception 'Payout events are append-only and cannot be changed or deleted.';
end;
$function$;

REVOKE ALL ON FUNCTION "public"."dcds_reject_payout_event_mutation"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.dcds_reject_reward_event_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$ begin raise exception 'Reward financial events are append-only.'; end; $function$;

REVOKE ALL ON FUNCTION "public"."dcds_reject_reward_event_mutation"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.dcds_reverse_referral_reward (
  p_order_id      uuid,
  p_reason        text,
  p_actor_user_id uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_reward public.dcds_reward_ledger%rowtype;
  v_payout_status text;
  v_reason text;
begin
  if p_order_id is null then raise exception 'Order ID is required.'; end if;
  v_reason:=left(trim(coalesce(p_reason,'')),500);
  if v_reason='' then raise exception 'A refund or reversal reason is required.'; end if;

  select * into v_reward from public.dcds_reward_ledger
  where order_id=p_order_id for update;
  if not found then
    return jsonb_build_object('success',true,'result','no_referral_reward');
  end if;

  if exists(select 1 from public.dcds_reward_events
    where reward_ledger_id=v_reward.id and event_type in ('reward_reversed','recovery_due')) then
    return jsonb_build_object('success',true,'result','already_reversed');
  end if;

  if v_reward.status='available' then
    update public.dcds_reward_ledger
      set status='reversed',reversed_at=now(),reversal_reason=v_reason
      where id=v_reward.id;
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id)
    values(v_reward.id,p_order_id,v_reward.ambassador_user_id,'reward_reversed',-v_reward.amount,v_reason,p_actor_user_id);
    return jsonb_build_object('success',true,'result','reward_reversed');
  elsif v_reward.status='held' then
    select status into v_payout_status from public.dcds_payout_requests where id=v_reward.payout_request_id for update;
    if v_payout_status in ('requested','processing') then
      raise exception 'Reward is reserved in an open payout. Reconcile or close that payout before refunding this course order.';
    end if;
    update public.dcds_reward_ledger
      set status='reversed',reversed_at=now(),reversal_reason=v_reason
      where id=v_reward.id;
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id)
    values(v_reward.id,p_order_id,v_reward.ambassador_user_id,'reward_reversed',-v_reward.amount,v_reason,p_actor_user_id);
    return jsonb_build_object('success',true,'result','reward_reversed');
  elsif v_reward.status='paid' then
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id,details)
    values(v_reward.id,p_order_id,v_reward.ambassador_user_id,'recovery_due',-v_reward.amount,v_reason,p_actor_user_id,
      jsonb_build_object('note','Reward was already paid; record recovery liability for administrator review.'));
    return jsonb_build_object('success',true,'result','recovery_due','amount',v_reward.amount);
  elsif v_reward.status='reversed' then
    return jsonb_build_object('success',true,'result','already_reversed');
  else
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id)
    values(v_reward.id,p_order_id,v_reward.ambassador_user_id,'manual_review',0,v_reason,p_actor_user_id);
    return jsonb_build_object('success',true,'result','manual_review');
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."dcds_reverse_referral_reward"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.dcds_transition_payout (
  p_request_id           uuid,
  p_new_status           text,
  p_failure_reason       text  DEFAULT NULL::text,
  p_provider_transfer_id text  DEFAULT NULL::text,
  p_actor_user_id        uuid  DEFAULT NULL::uuid,
  p_details              jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_request public.dcds_payout_requests%rowtype;
begin
 if p_new_status not in ('processing','paid','failed','cancelled') then raise exception 'Unsupported payout transition.'; end if;
 select * into v_request from public.dcds_payout_requests where id=p_request_id for update;
 if not found then raise exception 'Payout request not found.'; end if;

 if v_request.status=p_new_status then
   if p_new_status='processing' and nullif(trim(coalesce(p_provider_transfer_id,'')),'') is not null then
     if v_request.provider_transfer_id is not null and v_request.provider_transfer_id<>p_provider_transfer_id then
       raise exception 'A different provider transfer is already attached to this payout.';
     end if;
     update public.dcds_payout_requests set provider_transfer_id=p_provider_transfer_id where id=p_request_id;
     insert into public.dcds_payout_events(payout_request_id,user_id,event_type,amount,currency,actor_user_id,details)
     values(p_request_id,v_request.user_id,'processing',v_request.amount,v_request.currency,p_actor_user_id,
       coalesce(p_details,'{}'::jsonb)||jsonb_build_object('provider_transfer_id',p_provider_transfer_id));
   end if;
   return jsonb_build_object('success',true,'status',v_request.status,'unchanged',true);
 end if;

 if v_request.status not in ('requested','processing') then raise exception 'This payout request is already closed.'; end if;
 if p_new_status='processing' then
   if v_request.status<>'requested' then raise exception 'Invalid payout transition.'; end if;
   update public.dcds_payout_requests set status='processing',provider_transfer_id=coalesce(p_provider_transfer_id,provider_transfer_id) where id=p_request_id;
 elsif p_new_status='paid' then
   if v_request.status<>'processing' then raise exception 'Payout must be processing before it can be marked paid.'; end if;
   if nullif(trim(coalesce(p_provider_transfer_id,v_request.provider_transfer_id,'')),'') is null then raise exception 'Verified provider transfer ID is required.'; end if;
   update public.dcds_payout_requests set status='paid',provider_transfer_id=coalesce(p_provider_transfer_id,provider_transfer_id),processed_at=now(),failure_reason=null where id=p_request_id;
   update public.dcds_reward_ledger set status='paid' where payout_request_id=p_request_id and status='held';
 elsif p_new_status in ('failed','cancelled') then
   update public.dcds_payout_requests set status=p_new_status,failure_reason=left(coalesce(p_failure_reason,'Payout was not completed.'),500),processed_at=now() where id=p_request_id;
   update public.dcds_reward_ledger set status='available',payout_request_id=null where payout_request_id=p_request_id and status='held';
 end if;
 insert into public.dcds_payout_events(payout_request_id,user_id,event_type,amount,currency,actor_user_id,details)
 values(p_request_id,v_request.user_id,p_new_status,v_request.amount,v_request.currency,p_actor_user_id,
   coalesce(p_details,'{}'::jsonb)||jsonb_build_object('provider_transfer_id',coalesce(p_provider_transfer_id,v_request.provider_transfer_id),'failure_reason',p_failure_reason));
 return jsonb_build_object('success',true,'status',p_new_status);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."dcds_transition_payout"(uuid, text, text, text, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_general_course_channels()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$

                                                                                                                                                                    DECLARE

                                                                                                                                                                        current_user_id UUID;

                                                                                                                                                                            user_is_verified BOOLEAN;

                                                                                                                                                                                student_is_enrolled BOOLEAN;

                                                                                                                                                                                    channel_list JSONB;

                                                                                                                                                                                    BEGIN

                                                                                                                                                                                        -- Identify the authenticated student.

                                                                                                                                                                                            current_user_id := auth.uid();


                                                                                                                                                                                                IF current_user_id IS NULL THEN

                                                                                                                                                                                                        RAISE EXCEPTION 'Authentication required.'
                                                                                                                                                                                                                USING ERRCODE = '42501';

                                                                                                                                                                                                                    END IF;


                                                                                                                                                                                                                        -- Confirm that the student's email is verified.

                                                                                                                                                                                                                            SELECT EXISTS (
                                                                                                                                                                                                                                    SELECT 1

                                                                                                                                                                                                                                            FROM auth.users u

                                                                                                                                                                                                                                                    WHERE u.id = current_user_id

                                                                                                                                                                                                                                                            AND u.email_confirmed_at IS NOT NULL

                                                                                                                                                                                                                                                                )

                                                                                                                                                                                                                                                                    INTO user_is_verified;


                                                                                                                                                                                                                                                                        IF NOT user_is_verified THEN

                                                                                                                                                                                                                                                                                RAISE EXCEPTION 'Email verification required.'
                                                                                                                                                                                                                                                                                        USING ERRCODE = '42501';

                                                                                                                                                                                                                                                                                            END IF;


                                                                                                                                                                                                                                                                                                -- Check whether this student owns the General Course.

                                                                                                                                                                                                                                                                                                    SELECT EXISTS (
                                                                                                                                                                                                                                                                                                            SELECT 1

                                                                                                                                                                                                                                                                                                                    FROM public.enrollments e

                                                                                                                                                                                                                                                                                                                            WHERE e.user_id = current_user_id

                                                                                                                                                                                                                                                                                                                                    AND e.course_id =
                                                                                                                                                                                                                                                                                                                                                'a1030000-0000-4000-8000-000000000001'::UUID

                                                                                                                                                                                                                                                                                                                                                    )

                                                                                                                                                                                                                                                                                                                                                        INTO student_is_enrolled;


                                                                                                                                                                                                                                                                                                                                                            IF NOT student_is_enrolled THEN

                                                                                                                                                                                                                                                                                                                                                                    RAISE EXCEPTION
                                                                                                                                                                                                                                                                                                                                                                                'General Course enrollment required.'

                                                                                                                                                                                                                                                                                                                                                                                        USING ERRCODE = '42501';

                                                                                                                                                                                                                                                                                                                                                                                            END IF;


                                                                                                                                                                                                                                                                                                                                                                                                -- Return the four private Telegram links only
                                                                                                                                                                                                                                                                                                                                                                                                    -- after successful authentication and enrollment checks.

                                                                                                                                                                                                                                                                                                                                                                                                        SELECT COALESCE(
                                                                                                                                                                                                                                                                                                                                                                                                                JSONB_AGG(
                                                                                                                                                                                                                                                                                                                                                                                                                            JSONB_BUILD_OBJECT(
                                                                                                                                                                                                                                                                                                                                                                                                                                            'name', c.channel_name,
                                                                                                                                                                                                                                                                                                                                                                                                                                                            'url', c.invite_url
                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ORDER BY c.channel_number
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    '[]'::JSONB
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            INTO channel_list

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM public.dcds_general_course_channels c;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    IF JSONB_ARRAY_LENGTH(channel_list) <> 4 THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            RAISE EXCEPTION
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        'General Course channels are not fully configured.';

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            END IF;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                RETURN JSONB_BUILD_OBJECT(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        'success', TRUE,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                'channels', channel_list
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    END;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    $function$;

REVOKE ALL ON FUNCTION "public"."get_general_course_channels"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.is_dcds_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    SELECT EXISTS (
            SELECT 1
                    FROM public.dcds_admins
                            WHERE user_id = (SELECT auth.uid())
                                );
                                $function$;

REVOKE ALL ON FUNCTION "public"."is_dcds_admin"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.issue_course_certificate (
  p_course_id uuid
)
  RETURNS public.certificates
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
DECLARE
  v_user_id uuid;
  v_total_lessons integer;
  v_completed_lessons integer;
  v_policy_version integer;
  v_snapshot jsonb;
  v_certificate public.certificates;
  v_certificate_number text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.enrollments
    WHERE user_id = v_user_id
      AND course_id = p_course_id
  ) THEN
    RAISE EXCEPTION 'You are not enrolled in this course.';
  END IF;

  -- An already-issued certificate is immutable and remains valid even if
  -- the course gains lessons or its completion policy later changes.
  SELECT *
    INTO v_certificate
    FROM public.certificates
    WHERE user_id = v_user_id
      AND course_id = p_course_id;

  IF FOUND THEN
    IF v_certificate.status = 'revoked' THEN
      RAISE EXCEPTION 'This certificate has been revoked.';
    END IF;
    RETURN v_certificate;
  END IF;

  SELECT
    COUNT(*)::integer,
    COUNT(p.id)::integer,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'lesson_id', l.id,
          'lesson_number', l.lesson_number,
          'lesson_title', l.lesson_title
        )
        ORDER BY l.lesson_number
      ),
      '[]'::jsonb
    )
  INTO v_total_lessons, v_completed_lessons, v_snapshot
  FROM public.course_lessons l
  LEFT JOIN public.lesson_progress p
    ON p.lesson_id = l.id
   AND p.course_id = p_course_id
   AND p.user_id = v_user_id
  WHERE l.course_id = p_course_id;

  IF v_total_lessons = 0 THEN
    RAISE EXCEPTION 'No lessons are available for this course yet.';
  END IF;

  IF v_completed_lessons <> v_total_lessons THEN
    RAISE EXCEPTION 'You must complete every required lesson before receiving your certificate.';
  END IF;

  SELECT completion_policy_version
    INTO v_policy_version
    FROM public.courses
    WHERE id = p_course_id;

  v_certificate_number :=
    'DCDS-' || UPPER(REPLACE(gen_random_uuid()::text, '-', ''));

  INSERT INTO public.certificates (
    certificate_number,
    user_id,
    course_id,
    status,
    completion_policy_version,
    completed_lesson_count,
    completion_snapshot,
    completion_recorded_at
  )
  VALUES (
    v_certificate_number,
    v_user_id,
    p_course_id,
    'issued',
    v_policy_version,
    v_total_lessons,
    jsonb_build_object(
      'rule', 'all_lessons',
      'assessment_required', false,
      'policy_version', v_policy_version,
      'required_lessons', v_snapshot,
      'completed_lesson_count', v_completed_lessons,
      'recorded_at', now()
    ),
    now()
  )
  RETURNING * INTO v_certificate;

  RETURN v_certificate;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."issue_course_certificate"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.process_dcds_successful_course_order()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_code text;
  v_referral public.dcds_referrals%rowtype;
  v_inserted integer := 0;
begin
  if new.status <> 'successful' then
    return new;
  end if;

  -- Activate the purchaser as an ambassador after their first verified purchase.
  if not exists (
    select 1 from public.dcds_ambassadors a where a.user_id = new.user_id
  ) then
    loop
      v_code := upper(encode(gen_random_bytes(5), 'hex'));
      insert into public.dcds_ambassadors(user_id, referral_code, status, activated_at)
      values (new.user_id, v_code, 'active', now())
      on conflict do nothing;

      exit when exists (
        select 1 from public.dcds_ambassadors a where a.user_id = new.user_id
      );
    end loop;
  end if;

  -- A referral can earn only once per distinct course for that referred student.
  select *
    into v_referral
  from public.dcds_referrals r
  where r.referred_user_id = new.user_id
    and r.status in ('attributed', 'qualified')
  for update;

  if found then
    insert into public.dcds_reward_ledger(
      ambassador_user_id,
      referred_user_id,
      order_id,
      course_id,
      amount,
      currency,
      status,
      available_at
    )
    values (
      v_referral.referrer_user_id,
      new.user_id,
      new.id,
      new.course_id,
      1000.00,
      'NGN',
      'available',
      now()
    )
    on conflict do nothing;

    get diagnostics v_inserted = row_count;

    if v_referral.status = 'attributed' then
      update public.dcds_referrals
      set status = 'qualified',
          qualified_at = coalesce(qualified_at, now())
      where id = v_referral.id;
    end if;
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."process_dcds_successful_course_order"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.publish_dcds_announcement (
  p_title     text,
  p_message   text,
  p_category  text,
  p_audience  text,
  p_course_id uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$

                    DECLARE
                        v_admin_id UUID;
                            v_notification_id UUID;
                                v_recipient_count INTEGER := 0;
                                    v_course_id UUID;

                                        v_general_course_id CONSTANT UUID :=
                                                'a1030000-0000-4000-8000-000000000001';

                                                BEGIN

                                                    -- =====================================================
                                                        -- 1. VERIFY AUTHENTICATED ADMINISTRATOR
                                                            -- =====================================================

                                                                v_admin_id := auth.uid();

                                                                    IF v_admin_id IS NULL THEN
                                                                            RAISE EXCEPTION 'Authentication required.';
                                                                                END IF;

                                                                                    IF NOT EXISTS (
                                                                                            SELECT 1
                                                                                                    FROM public.dcds_admins
                                                                                                            WHERE user_id = v_admin_id
                                                                                                                ) THEN
                                                                                                                        RAISE EXCEPTION 'Administrator permission required.';
                                                                                                                            END IF;


                                                                                                                                -- =====================================================
                                                                                                                                    -- 2. VALIDATE ANNOUNCEMENT CONTENT
                                                                                                                                        -- =====================================================

                                                                                                                                            IF p_title IS NULL OR LENGTH(TRIM(p_title)) = 0 THEN
                                                                                                                                                    RAISE EXCEPTION 'Announcement title is required.';
                                                                                                                                                        END IF;

                                                                                                                                                            IF LENGTH(TRIM(p_title)) > 200 THEN
                                                                                                                                                                    RAISE EXCEPTION 'Title cannot exceed 200 characters.';
                                                                                                                                                                        END IF;

                                                                                                                                                                            IF p_message IS NULL OR LENGTH(TRIM(p_message)) = 0 THEN
                                                                                                                                                                                    RAISE EXCEPTION 'Announcement message is required.';
                                                                                                                                                                                        END IF;

                                                                                                                                                                                            IF LENGTH(TRIM(p_message)) > 10000 THEN
                                                                                                                                                                                                    RAISE EXCEPTION 'Announcement message is too long.';
                                                                                                                                                                                                        END IF;


                                                                                                                                                                                                            -- =====================================================
                                                                                                                                                                                                                -- 3. VALIDATE CATEGORY
                                                                                                                                                                                                                    -- =====================================================

                                                                                                                                                                                                                        IF p_category NOT IN (
                                                                                                                                                                                                                                'general',
                                                                                                                                                                                                                                        'important',
                                                                                                                                                                                                                                                'course',
                                                                                                                                                                                                                                                        'promotion',
                                                                                                                                                                                                                                                                'event'
                                                                                                                                                                                                                                                                    ) THEN
                                                                                                                                                                                                                                                                            RAISE EXCEPTION 'Invalid announcement category.';
                                                                                                                                                                                                                                                                                END IF;


                                                                                                                                                                                                                                                                                    -- =====================================================
                                                                                                                                                                                                                                                                                        -- 4. VALIDATE AUDIENCE
                                                                                                                                                                                                                                                                                            -- =====================================================

                                                                                                                                                                                                                                                                                                IF p_audience NOT IN (
                                                                                                                                                                                                                                                                                                        'all',
                                                                                                                                                                                                                                                                                                                'enrolled',
                                                                                                                                                                                                                                                                                                                        'general_course',
                                                                                                                                                                                                                                                                                                                                'specific_course'
                                                                                                                                                                                                                                                                                                                                    ) THEN
                                                                                                                                                                                                                                                                                                                                            RAISE EXCEPTION 'Invalid announcement audience.';
                                                                                                                                                                                                                                                                                                                                                END IF;


                                                                                                                                                                                                                                                                                                                                                    -- =====================================================
                                                                                                                                                                                                                                                                                                                                                        -- 5. VALIDATE COURSE SELECTION
                                                                                                                                                                                                                                                                                                                                                            -- =====================================================

                                                                                                                                                                                                                                                                                                                                                                IF p_audience = 'general_course' THEN

                                                                                                                                                                                                                                                                                                                                                                        v_course_id := v_general_course_id;

                                                                                                                                                                                                                                                                                                                                                                            ELSIF p_audience = 'specific_course' THEN

                                                                                                                                                                                                                                                                                                                                                                                    IF p_course_id IS NULL THEN
                                                                                                                                                                                                                                                                                                                                                                                                RAISE EXCEPTION 'Please select a course.';
                                                                                                                                                                                                                                                                                                                                                                                                        END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                IF NOT EXISTS (
                                                                                                                                                                                                                                                                                                                                                                                                                            SELECT 1
                                                                                                                                                                                                                                                                                                                                                                                                                                        FROM public.courses
                                                                                                                                                                                                                                                                                                                                                                                                                                                    WHERE id = p_course_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                            ) THEN
                                                                                                                                                                                                                                                                                                                                                                                                                                                                        RAISE EXCEPTION 'Selected course does not exist.';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        v_course_id := p_course_id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ELSE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    v_course_id := NULL;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        END IF;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            -- =====================================================
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                -- 6. CREATE ANNOUNCEMENT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- =====================================================

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        INSERT INTO public.notifications (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                title,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        message,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                category,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        audience,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                course_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        created_by
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                VALUES (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        TRIM(p_title),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                TRIM(p_message),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        p_category,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                p_audience,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        v_course_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                v_admin_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        RETURNING id INTO v_notification_id;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            -- =====================================================
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                -- 7. SELECT RECIPIENTS AND CREATE NOTIFICATIONS
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- =====================================================

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        IF p_audience = 'all' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                -- All registered non-admin accounts

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                SELECT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        u.id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM auth.users u
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        WHERE NOT EXISTS (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    SELECT 1
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM public.dcds_admins da
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            WHERE da.user_id = u.id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    DO NOTHING;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ELSIF p_audience = 'enrolled' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                -- All enrolled students

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                SELECT DISTINCT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        e.user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM public.enrollments e
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                DO NOTHING;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ELSIF p_audience = 'general_course' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            -- General Course students

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            SELECT DISTINCT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    e.user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            FROM public.enrollments e
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    WHERE e.course_id = v_general_course_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    DO NOTHING;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ELSIF p_audience = 'specific_course' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                -- Students enrolled in the selected course

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                SELECT DISTINCT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        e.user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM public.enrollments e
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        WHERE e.course_id = v_course_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        DO NOTHING;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            END IF;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                -- =====================================================
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- 8. COUNT RECIPIENTS
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        -- =====================================================

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            GET DIAGNOSTICS
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    v_recipient_count = ROW_COUNT;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        -- =====================================================
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            -- 9. RETURN SUCCESS RESPONSE
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                -- =====================================================

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    RETURN JSONB_BUILD_OBJECT(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            'success', TRUE,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    'message', 'Announcement published successfully.',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            'notification_id', v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    'recipients', v_recipient_count,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            'audience', p_audience
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                END;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                $function$;

REVOKE ALL ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.publish_dcds_announcement (
  p_title            text,
  p_message          text,
  p_category         text,
  p_audience         text,
  p_course_id        uuid,
  p_delivery_channel text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
                                                                                                                              DECLARE
                                                                                                                                  v_admin_id UUID;
                                                                                                                                      v_notification_id UUID;
                                                                                                                                          v_recipient_count INTEGER := 0;
                                                                                                                                              v_course_id UUID;

                                                                                                                                                  v_general_course_id CONSTANT UUID :=
                                                                                                                                                          'a1030000-0000-4000-8000-000000000001';

                                                                                                                                                          BEGIN

                                                                                                                                                              -- 1. Verify administrator
                                                                                                                                                                  v_admin_id := auth.uid();

                                                                                                                                                                      IF v_admin_id IS NULL THEN
                                                                                                                                                                              RAISE EXCEPTION 'Authentication required.';
                                                                                                                                                                                  END IF;

                                                                                                                                                                                      IF NOT EXISTS (
                                                                                                                                                                                              SELECT 1
                                                                                                                                                                                                      FROM public.dcds_admins
                                                                                                                                                                                                              WHERE user_id = v_admin_id
                                                                                                                                                                                                                  ) THEN
                                                                                                                                                                                                                          RAISE EXCEPTION 'Administrator permission required.';
                                                                                                                                                                                                                              END IF;


                                                                                                                                                                                                                                  -- 2. Validate announcement content
                                                                                                                                                                                                                                      IF p_title IS NULL OR LENGTH(TRIM(p_title)) = 0 THEN
                                                                                                                                                                                                                                              RAISE EXCEPTION 'Announcement title is required.';
                                                                                                                                                                                                                                                  END IF;

                                                                                                                                                                                                                                                      IF LENGTH(TRIM(p_title)) > 200 THEN
                                                                                                                                                                                                                                                              RAISE EXCEPTION 'Title cannot exceed 200 characters.';
                                                                                                                                                                                                                                                                  END IF;

                                                                                                                                                                                                                                                                      IF p_message IS NULL OR LENGTH(TRIM(p_message)) = 0 THEN
                                                                                                                                                                                                                                                                              RAISE EXCEPTION 'Announcement message is required.';
                                                                                                                                                                                                                                                                                  END IF;

                                                                                                                                                                                                                                                                                      IF LENGTH(TRIM(p_message)) > 10000 THEN
                                                                                                                                                                                                                                                                                              RAISE EXCEPTION 'Announcement message is too long.';
                                                                                                                                                                                                                                                                                                  END IF;


                                                                                                                                                                                                                                                                                                      -- 3. Validate category
                                                                                                                                                                                                                                                                                                          IF p_category IS NULL OR p_category NOT IN (
                                                                                                                                                                                                                                                                                                                  'general',
                                                                                                                                                                                                                                                                                                                          'important',
                                                                                                                                                                                                                                                                                                                                  'course',
                                                                                                                                                                                                                                                                                                                                          'promotion',
                                                                                                                                                                                                                                                                                                                                                  'event'
                                                                                                                                                                                                                                                                                                                                                      ) THEN
                                                                                                                                                                                                                                                                                                                                                              RAISE EXCEPTION 'Invalid announcement category.';
                                                                                                                                                                                                                                                                                                                                                                  END IF;


                                                                                                                                                                                                                                                                                                                                                                      -- 4. Validate audience
                                                                                                                                                                                                                                                                                                                                                                          IF p_audience IS NULL OR p_audience NOT IN (
                                                                                                                                                                                                                                                                                                                                                                                  'all',
                                                                                                                                                                                                                                                                                                                                                                                          'enrolled',
                                                                                                                                                                                                                                                                                                                                                                                                  'general_course',
                                                                                                                                                                                                                                                                                                                                                                                                          'specific_course'
                                                                                                                                                                                                                                                                                                                                                                                                              ) THEN
                                                                                                                                                                                                                                                                                                                                                                                                                      RAISE EXCEPTION 'Invalid announcement audience.';
                                                                                                                                                                                                                                                                                                                                                                                                                          END IF;


                                                                                                                                                                                                                                                                                                                                                                                                                              -- 5. Validate delivery channel
                                                                                                                                                                                                                                                                                                                                                                                                                                  IF p_delivery_channel IS NULL OR p_delivery_channel NOT IN (
                                                                                                                                                                                                                                                                                                                                                                                                                                          'notification',
                                                                                                                                                                                                                                                                                                                                                                                                                                                  'ticker'
                                                                                                                                                                                                                                                                                                                                                                                                                                                      ) THEN
                                                                                                                                                                                                                                                                                                                                                                                                                                                              RAISE EXCEPTION 'Choose Notification Only or Ticker Only.';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                  END IF;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                      -- 6. Validate course selection
                                                                                                                                                                                                                                                                                                                                                                                                                                                                          IF p_audience = 'general_course' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  v_course_id := v_general_course_id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ELSIF p_audience = 'specific_course' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              IF p_course_id IS NULL THEN
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          RAISE EXCEPTION 'Please select a course.';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          IF NOT EXISTS (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      SELECT 1
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  FROM public.courses
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              WHERE id = p_course_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ) THEN
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  RAISE EXCEPTION 'Selected course does not exist.';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  v_course_id := p_course_id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ELSE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              v_course_id := NULL;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  END IF;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      -- 7. Create announcement record
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          INSERT INTO public.notifications (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  title,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          message,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  category,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          audience,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  course_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          created_by,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  delivery_channel
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          VALUES (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  TRIM(p_title),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          TRIM(p_message),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  p_category,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          p_audience,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  v_course_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          v_admin_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  p_delivery_channel
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          RETURNING id INTO v_notification_id;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              -- 8. Create recipients only for Notification Only
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  IF p_delivery_channel = 'notification' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          IF p_audience = 'all' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              SELECT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              u.id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          FROM auth.users u
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      WHERE NOT EXISTS (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      SELECT 1
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      FROM public.dcds_admins da
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      WHERE da.user_id = u.id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          DO NOTHING;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ELSIF p_audience = 'enrolled' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      SELECT DISTINCT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      e.user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  FROM public.enrollments e
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          DO NOTHING;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ELSIF p_audience = 'general_course' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      SELECT DISTINCT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      e.user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  FROM public.enrollments e
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              WHERE e.course_id = v_general_course_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      DO NOTHING;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ELSIF p_audience = 'specific_course' THEN

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          INSERT INTO public.notification_recipients (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  SELECT DISTINCT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  e.user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              FROM public.enrollments e
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          WHERE e.course_id = v_course_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ON CONFLICT (notification_id, user_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  DO NOTHING;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      END IF;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          -- 9. Return result
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              RETURN JSONB_BUILD_OBJECT(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      'success', TRUE,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              'message', 'Announcement published successfully.',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      'notification_id', v_notification_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              'recipients', v_recipient_count,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      'audience', p_audience,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              'delivery_channel', p_delivery_channel
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  END;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  $function$;

REVOKE ALL ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.start_dcds_quiz (
  p_quiz_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE v_user uuid:=auth.uid(); v_quiz public.quizzes%ROWTYPE; v_attempt_no integer; v_attempt_id uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
 SELECT * INTO v_quiz FROM public.quizzes WHERE id=p_quiz_id AND status='published'
 AND (available_from IS NULL OR available_from<=now()) AND (available_until IS NULL OR available_until>now());
 IF NOT FOUND THEN RAISE EXCEPTION 'Quiz is not currently available'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id=v_user AND course_id=v_quiz.course_id) THEN RAISE EXCEPTION 'Active course enrollment is required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.quiz_questions WHERE quiz_id=p_quiz_id) THEN RAISE EXCEPTION 'This quiz has no questions yet'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||p_quiz_id::text,0));
 SELECT COALESCE(MAX(attempt_number),0)+1 INTO v_attempt_no FROM public.quiz_attempts WHERE quiz_id=p_quiz_id AND user_id=v_user;
 IF v_attempt_no>v_quiz.max_attempts THEN RAISE EXCEPTION 'You have used all allowed attempts'; END IF;
 INSERT INTO public.quiz_attempts(quiz_id,user_id,attempt_number) VALUES(p_quiz_id,v_user,v_attempt_no) RETURNING id INTO v_attempt_id;
 RETURN v_attempt_id;
END $function$;

REVOKE ALL ON FUNCTION "public"."start_dcds_quiz"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.submit_dcds_quiz (
  p_attempt_id uuid,
  p_answers    jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE v_user uuid:=auth.uid(); v_attempt public.quiz_attempts%ROWTYPE; v_quiz public.quizzes%ROWTYPE;
 v_total numeric(8,2):=0; v_score numeric(8,2):=0; v_pct numeric(5,2):=0; v_count integer:=0; v_answer text; q record;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
 IF jsonb_typeof(p_answers)<>'object' THEN RAISE EXCEPTION 'Answers must be a JSON object keyed by question ID'; END IF;
 SELECT * INTO v_attempt FROM public.quiz_attempts WHERE id=p_attempt_id AND user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quiz attempt not found'; END IF;
 IF v_attempt.status<>'in_progress' THEN RAISE EXCEPTION 'This attempt has already been submitted'; END IF;
 SELECT * INTO v_quiz FROM public.quizzes WHERE id=v_attempt.quiz_id;
 IF v_quiz.time_limit_seconds IS NOT NULL AND now()>v_attempt.started_at+make_interval(secs=>v_quiz.time_limit_seconds) THEN
   UPDATE public.quiz_attempts SET status='expired',submitted_at=now() WHERE id=p_attempt_id;
   RETURN jsonb_build_object('attempt_id',p_attempt_id,'expired',true,'message','The quiz time limit has expired');
 END IF;
 IF EXISTS (SELECT 1 FROM public.quiz_questions qq WHERE qq.quiz_id=v_attempt.quiz_id AND NOT EXISTS (SELECT 1 FROM public.quiz_answer_keys ak WHERE ak.question_id=qq.id)) THEN
   RAISE EXCEPTION 'Quiz setup is incomplete: every question needs an answer key';
 END IF;
 FOR q IN SELECT qq.id,qq.points,ak.correct_answer FROM public.quiz_questions qq JOIN public.quiz_answer_keys ak ON ak.question_id=qq.id WHERE qq.quiz_id=v_attempt.quiz_id LOOP
   v_total:=v_total+q.points; v_count:=v_count+1; v_answer:=p_answers->>q.id::text;
   INSERT INTO public.quiz_attempt_answers(attempt_id,question_id,answer,is_correct,points_awarded)
   VALUES(p_attempt_id,q.id,v_answer,(v_answer IS NOT NULL AND v_answer=q.correct_answer),CASE WHEN v_answer IS NOT NULL AND v_answer=q.correct_answer THEN q.points ELSE 0 END);
   IF v_answer IS NOT NULL AND v_answer=q.correct_answer THEN v_score:=v_score+q.points; END IF;
 END LOOP;
 IF v_count=0 THEN RAISE EXCEPTION 'This quiz has no questions yet'; END IF;
 v_pct:=round((v_score/v_total)*100,2);
 UPDATE public.quiz_attempts SET status='graded',submitted_at=now(),score=v_score,total_points=v_total,percentage=v_pct,passed=(v_pct>=v_quiz.pass_mark) WHERE id=p_attempt_id;
 RETURN jsonb_build_object('attempt_id',p_attempt_id,'score',v_score,'total_points',v_total,'percentage',v_pct,'passed',(v_pct>=v_quiz.pass_mark),'expired',false);
END $function$;

REVOKE ALL ON FUNCTION "public"."submit_dcds_quiz"(uuid, jsonb) FROM PUBLIC, "anon";

ALTER TABLE "public"."admin_users"
  ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."assignment_submissions"
  ADD CONSTRAINT "assignment_submissions_graded_by_fkey" FOREIGN KEY (graded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."assignment_submissions"
  ADD CONSTRAINT "assignment_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."assignments"
  ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."assignment_submissions"
  ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;

ALTER TABLE "public"."certificates"
  ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."assignments"
  ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."certificates"
  ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."course_lessons"
  ADD CONSTRAINT "course_lessons_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."course_materials"
  ADD CONSTRAINT "course_materials_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."dcds_admins"
  ADD CONSTRAINT "dcds_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."dcds_ambassadors"
  ADD CONSTRAINT "dcds_ambassadors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_payout_accounts"
  ADD CONSTRAINT "dcds_payout_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.dcds_ambassadors(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_payout_events"
  ADD CONSTRAINT "dcds_payout_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_payout_requests"
  ADD CONSTRAINT "dcds_payout_requests_payout_account_id_fkey" FOREIGN KEY (payout_account_id) REFERENCES public.dcds_payout_accounts(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_payout_events"
  ADD CONSTRAINT "dcds_payout_events_payout_request_id_fkey" FOREIGN KEY (payout_request_id) REFERENCES public.dcds_payout_requests(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_payout_requests"
  ADD CONSTRAINT "dcds_payout_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.dcds_ambassadors(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_referrals"
  ADD CONSTRAINT "dcds_referrals_referred_user_id_fkey" FOREIGN KEY (referred_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_referrals"
  ADD CONSTRAINT "dcds_referrals_referrer_user_id_fkey" FOREIGN KEY (referrer_user_id) REFERENCES public.dcds_ambassadors(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_reviews"
  ADD CONSTRAINT "dcds_reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."dcds_reward_events"
  ADD CONSTRAINT "dcds_reward_events_ambassador_user_id_fkey" FOREIGN KEY (ambassador_user_id) REFERENCES public.dcds_ambassadors(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_reward_ledger"
  ADD CONSTRAINT "dcds_reward_ledger_ambassador_user_id_fkey" FOREIGN KEY (ambassador_user_id) REFERENCES public.dcds_ambassadors(user_id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_reward_ledger"
  ADD CONSTRAINT "dcds_reward_ledger_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_reward_ledger"
  ADD CONSTRAINT "dcds_reward_ledger_payout_request_id_fkey" FOREIGN KEY (payout_request_id) REFERENCES public.dcds_payout_requests(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_reward_events"
  ADD CONSTRAINT "dcds_reward_events_reward_ledger_id_fkey" FOREIGN KEY (reward_ledger_id) REFERENCES public.dcds_reward_ledger(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_reward_ledger"
  ADD CONSTRAINT "dcds_reward_ledger_referred_user_id_fkey" FOREIGN KEY (referred_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."enrollments"
  ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);

ALTER TABLE "public"."enrollments"
  ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.course_lessons(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."notification_recipients"
  ADD CONSTRAINT "notification_recipients_notification_user_unique" UNIQUE (notification_id, user_id);

ALTER TABLE "public"."notification_recipients"
  ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."notification_recipients"
  ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);

ALTER TABLE "public"."dcds_reward_events"
  ADD CONSTRAINT "dcds_reward_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

ALTER TABLE "public"."dcds_reward_ledger"
  ADD CONSTRAINT "dcds_reward_ledger_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

ALTER TABLE "public"."enrollments"
  ADD CONSTRAINT "enrollments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_attempt_answers"
  ADD CONSTRAINT "quiz_attempt_answers_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES public.quiz_attempts(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_answer_keys"
  ADD CONSTRAINT "quiz_answer_keys_question_id_fkey" FOREIGN KEY (question_id) REFERENCES public.quiz_questions(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_attempt_answers"
  ADD CONSTRAINT "quiz_attempt_answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES public.quiz_questions(id) ON DELETE CASCADE;

ALTER TABLE "public"."quizzes"
  ADD CONSTRAINT "quizzes_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."quizzes"
  ADD CONSTRAINT "quizzes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_questions"
  ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_admin_audit"
  ADD CONSTRAINT "student_admin_audit_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id);

ALTER TABLE "public"."student_admin_audit"
  ADD CONSTRAINT "student_admin_audit_student_id_fkey" FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_admin_notes"
  ADD CONSTRAINT "student_admin_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."student_admin_notes"
  ADD CONSTRAINT "student_admin_notes_student_id_fkey" FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_reviews"
  ADD CONSTRAINT "student_reviews_student_id_fkey" FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_support_tickets"
  ADD CONSTRAINT "student_support_tickets_responded_by_fkey" FOREIGN KEY (responded_by) REFERENCES auth.users(id);

ALTER TABLE "public"."student_support_tickets"
  ADD CONSTRAINT "student_support_tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX assignment_submissions_user_idx ON public.assignment_submissions USING btree (user_id, submitted_at DESC);

CREATE INDEX assignments_course_status_idx ON public.assignments USING btree (course_id, status);

CREATE INDEX certificates_course_id_idx ON public.certificates USING btree (course_id);

CREATE INDEX certificates_user_id_idx ON public.certificates USING btree (user_id);

CREATE INDEX dcds_general_course_enrollment_lookup_idx ON public.enrollments USING btree (user_id, course_id);

CREATE INDEX dcds_payout_events_request_idx ON public.dcds_payout_events USING btree (payout_request_id, created_at);

CREATE INDEX dcds_payout_requests_status_idx ON public.dcds_payout_requests USING btree (status, requested_at);

CREATE INDEX dcds_payout_requests_user_created_idx ON public.dcds_payout_requests USING btree (user_id, requested_at DESC);

CREATE INDEX dcds_referrals_referrer_created_idx ON public.dcds_referrals USING btree (referrer_user_id, referred_at DESC);

CREATE INDEX dcds_reward_events_ambassador_idx ON public.dcds_reward_events USING btree (ambassador_user_id, created_at);

CREATE INDEX dcds_reward_events_ledger_idx ON public.dcds_reward_events USING btree (reward_ledger_id, created_at);

CREATE INDEX dcds_reward_ledger_ambassador_status_idx ON public.dcds_reward_ledger USING btree (ambassador_user_id, status, created_at DESC);

CREATE INDEX dcds_reward_ledger_referred_course_idx ON public.dcds_reward_ledger USING btree (referred_user_id, course_id);

CREATE INDEX idx_enrollments_course_id ON public.enrollments USING btree (course_id);

CREATE INDEX idx_enrollments_course_user ON public.enrollments USING btree (course_id, user_id);

CREATE INDEX idx_enrollments_user_id ON public.enrollments USING btree (user_id);

CREATE INDEX idx_notification_recipients_unread ON public.notification_recipients USING btree (user_id, read_at);

CREATE INDEX idx_notification_recipients_user ON public.notification_recipients USING btree (user_id);

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);

CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id);

CREATE INDEX idx_public_announcements_created ON public.public_announcements USING btree (created_at DESC);

CREATE INDEX idx_public_announcements_schedule ON public.public_announcements USING btree (starts_at, expires_at);

CREATE INDEX idx_public_announcements_status ON public.public_announcements USING btree (status);

CREATE INDEX lesson_progress_user_course_idx ON public.lesson_progress USING btree (user_id, course_id);

CREATE INDEX notification_recipients_notification_id_idx ON public.notification_recipients USING btree (notification_id);

CREATE INDEX notification_recipients_notification_idx ON public.notification_recipients USING btree (notification_id);

CREATE INDEX notification_recipients_unread_idx ON public.notification_recipients USING btree (user_id, read_at);

CREATE INDEX notification_recipients_user_id_idx ON public.notification_recipients USING btree (user_id);

CREATE INDEX notification_recipients_user_idx ON public.notification_recipients USING btree (user_id);

CREATE INDEX notifications_course_id_idx ON public.notifications USING btree (course_id);

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at DESC);

CREATE INDEX quiz_attempt_answers_attempt_idx ON public.quiz_attempt_answers USING btree (attempt_id);

CREATE INDEX quiz_attempts_user_quiz_idx ON public.quiz_attempts USING btree (user_id, quiz_id, created_at DESC);

CREATE INDEX quiz_questions_quiz_sort_idx ON public.quiz_questions USING btree (quiz_id, sort_order);

CREATE INDEX quizzes_course_status_idx ON public.quizzes USING btree (course_id, status);

CREATE INDEX student_support_tickets_user_created_idx ON public.student_support_tickets USING btree (user_id, created_at DESC);

CREATE TRIGGER dcds_capture_referral_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_dcds_referral_on_signup();

CREATE TRIGGER trg_bump_course_completion_policy_version
  AFTER INSERT OR DELETE OR UPDATE OF course_id ON public.course_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_course_completion_policy_version();

CREATE TRIGGER dcds_payout_events_immutable
  BEFORE DELETE OR UPDATE ON public.dcds_payout_events
  FOR EACH ROW
  EXECUTE FUNCTION public.dcds_reject_payout_event_mutation();

CREATE TRIGGER dcds_log_payout_request_created
  AFTER INSERT ON public.dcds_payout_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.dcds_log_payout_request_event();

CREATE TRIGGER dcds_reward_events_immutable
  BEFORE DELETE OR UPDATE ON public.dcds_reward_events
  FOR EACH ROW
  EXECUTE FUNCTION public.dcds_reject_reward_event_mutation();

CREATE TRIGGER trigger_auto_issue_certificate
  AFTER INSERT ON public.lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_issue_course_certificate();

CREATE TRIGGER dcds_process_successful_order
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (((new.status = 'successful'::text) AND (old.status IS DISTINCT FROM 'successful'::text)))
  EXECUTE FUNCTION public.process_dcds_successful_course_order();

CREATE TRIGGER trg_dcds_public_announcements_updated_at
  BEFORE UPDATE ON public.public_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.dcds_public_announcements_set_updated_at();

CREATE POLICY "DCDS admins manage assignment submissions" ON "public"."assignment_submissions"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "Students submit own assignments" ON "public"."assignment_submissions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM (public.assignments a
     JOIN public.enrollments e ON ((e.course_id = a.course_id)))
  WHERE
    ((a.id = assignment_submissions.assignment_id) AND (a.status = 'published'::text) AND (e.user_id = auth.uid()) AND ((a.due_at IS NULL) OR (a.due_at > now()) OR
    a.allow_late_submissions))))));

CREATE POLICY "Students view own assignment submissions" ON "public"."assignment_submissions"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "DCDS admins manage assignments" ON "public"."assignments"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "Enrolled students view published assignments" ON "public"."assignments"
  FOR SELECT
  TO "authenticated"
  USING (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM public.enrollments e
  WHERE ((e.course_id = assignments.course_id) AND (e.user_id = auth.uid()))))));

CREATE POLICY "Students can view their own certificates" ON "public"."certificates"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Enrolled students can view lessons" ON "public"."course_lessons"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.enrollments
  WHERE ((enrollments.course_id = course_lessons.course_id) AND (enrollments.user_id = auth.uid())))));

CREATE POLICY "Enrolled students can view materials" ON "public"."course_materials"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.enrollments
  WHERE ((enrollments.course_id = course_materials.course_id) AND (enrollments.user_id = auth.uid())))));

CREATE POLICY "Public can view courses" ON "public"."courses"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

CREATE POLICY "DCDS admins manage admin records" ON "public"."dcds_admins"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Ambassadors read own record" ON "public"."dcds_ambassadors"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "DCDS admins read ambassadors" ON "public"."dcds_ambassadors"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Ambassadors read own payout requests" ON "public"."dcds_payout_requests"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "DCDS admins read payout requests" ON "public"."dcds_payout_requests"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Ambassadors read own referrals" ON "public"."dcds_referrals"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = referrer_user_id));

CREATE POLICY "DCDS admins read referrals" ON "public"."dcds_referrals"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Anyone can read approved DCDS reviews" ON "public"."dcds_reviews"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((is_approved = true));

CREATE POLICY "DCDS admins can delete reviews" ON "public"."dcds_reviews"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT public.is_dcds_admin() AS is_dcds_admin));

CREATE POLICY "DCDS admins can moderate reviews" ON "public"."dcds_reviews"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT public.is_dcds_admin() AS is_dcds_admin))
  WITH CHECK (( SELECT public.is_dcds_admin() AS is_dcds_admin));

CREATE POLICY "DCDS admins can review all submissions" ON "public"."dcds_reviews"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_dcds_admin() AS is_dcds_admin));

CREATE POLICY "Students can submit pending DCDS reviews" ON "public"."dcds_reviews"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((user_id = auth.uid()) AND (is_approved = false) AND ((rating >= 1) AND (rating <= 5)) AND (length(TRIM(BOTH FROM display_name)) > 0) AND (length(TRIM(BOTH FROM
    course_title)) > 0) AND (length(TRIM(BOTH FROM review_text)) > 0)));

CREATE POLICY "Ambassadors read own rewards" ON "public"."dcds_reward_ledger"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = ambassador_user_id));

CREATE POLICY "DCDS admins read reward ledger" ON "public"."dcds_reward_ledger"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "DCDS students can read their own enrollments" ON "public"."enrollments"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own enrollments" ON "public"."enrollments"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Students can record their own progress" ON "public"."lesson_progress"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.enrollments e
  WHERE ((e.user_id = auth.uid()) AND (e.course_id = lesson_progress.course_id)))) AND (EXISTS ( SELECT 1
   FROM public.course_lessons l
  WHERE ((l.id = lesson_progress.lesson_id) AND (l.course_id = lesson_progress.course_id))))));

CREATE POLICY "Students can view their own progress" ON "public"."lesson_progress"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Admins can manage notification recipients" ON "public"."notification_recipients"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "Admins read all recipient records" ON "public"."notification_recipients"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_dcds_admin() AS is_dcds_admin));

CREATE POLICY "Admins view all recipient records" ON "public"."notification_recipients"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Students can update their own read status" ON "public"."notification_recipients"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students can view their own notification records" ON "public"."notification_recipients"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_dcds_admin()));

CREATE POLICY "Students read their recipient records" ON "public"."notification_recipients"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students update their read status" ON "public"."notification_recipients"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students view their recipient records" ON "public"."notification_recipients"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Admins can manage notifications" ON "public"."notifications"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "Admins read all notifications" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_dcds_admin() AS is_dcds_admin));

CREATE POLICY "Admins view all notifications" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Students can view their notifications" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.notification_recipients nr
  WHERE ((nr.notification_id = notifications.id) AND (nr.user_id = ( SELECT auth.uid() AS uid))))) OR public.is_dcds_admin()));

CREATE POLICY "Students read their notifications" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.notification_recipients nr
  WHERE ((nr.notification_id = notifications.id) AND (nr.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Students view their notifications" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.notification_recipients nr
  WHERE ((nr.notification_id = notifications.id) AND (nr.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Users can view their own orders" ON "public"."orders"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own payments" ON "public"."payments"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Authenticated users view currently published announcements" ON "public"."public_announcements"
  FOR SELECT
  TO "authenticated"
  USING (((status = 'published'::text) AND (starts_at <= now()) AND ((expires_at IS NULL) OR (expires_at > now()))));

CREATE POLICY "DCDS admins manage public announcements" ON "public"."public_announcements"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "DCDS admins manage quiz answer keys" ON "public"."quiz_answer_keys"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "DCDS admins view all quiz answers" ON "public"."quiz_attempt_answers"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Students view own quiz answers" ON "public"."quiz_attempt_answers"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.quiz_attempts a
  WHERE ((a.id = quiz_attempt_answers.attempt_id) AND (a.user_id = auth.uid())))));

CREATE POLICY "DCDS admins view all quiz attempts" ON "public"."quiz_attempts"
  FOR SELECT
  TO "authenticated"
  USING (public.is_dcds_admin());

CREATE POLICY "Students view own quiz attempts" ON "public"."quiz_attempts"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "DCDS admins manage quiz questions" ON "public"."quiz_questions"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "Enrolled students view published quiz questions" ON "public"."quiz_questions"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.quizzes q
     JOIN public.enrollments e ON ((e.course_id = q.course_id)))
  WHERE
    ((q.id = quiz_questions.quiz_id) AND (q.status = 'published'::text) AND (e.user_id = auth.uid()) AND ((q.available_from IS NULL) OR (q.available_from <= now())) AND
    ((q.available_until IS NULL) OR (q.available_until > now()))))));

CREATE POLICY "DCDS admins manage quizzes" ON "public"."quizzes"
  FOR ALL
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "Enrolled students view published quizzes" ON "public"."quizzes"
  FOR SELECT
  TO "authenticated"
  USING (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM public.enrollments e
  WHERE ((e.course_id = quizzes.course_id) AND (e.user_id = auth.uid())))) AND ((available_from IS NULL) OR (available_from <= now())) AND
    ((available_until IS NULL) OR (available_until > now()))));

CREATE POLICY "Anyone can read approved student reviews" ON "public"."student_reviews"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((is_approved = true));

CREATE POLICY "Students can submit their own reviews" ON "public"."student_reviews"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((student_id = auth.uid()) AND (is_approved = false) AND ((rating >= 1) AND (rating <= 5)) AND (length(TRIM(BOTH FROM student_name)) > 0) AND (length(TRIM(BOTH FROM
    course_name)) > 0) AND (length(TRIM(BOTH FROM review_text)) > 0)));

CREATE POLICY "DCDS admins can manage support tickets" ON "public"."student_support_tickets"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_dcds_admin())
  WITH CHECK (public.is_dcds_admin());

CREATE POLICY "Students can create their own support tickets" ON "public"."student_support_tickets"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Students can view their own support tickets" ON "public"."student_support_tickets"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) OR public.is_dcds_admin()));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."profiles";

GRANT EXECUTE ON FUNCTION "public"."admin_add_student_note"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_add_student_note"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_add_student_note"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_add_student_note"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_enrol_student"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_enrol_student"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_enrol_student"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_enrol_student"(uuid, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_get_student_record"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_get_student_record"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_get_student_record"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_get_student_record"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_list_students"(text, integer, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_list_students"(text, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_list_students"(text, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_list_students"(text, integer, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_remove_student_enrolment"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_remove_student_enrolment"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_remove_student_enrolment"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_remove_student_enrolment"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_set_student_access"(uuid, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_set_student_access"(uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_set_student_access"(uuid, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_set_student_access"(uuid, boolean) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_update_student_profile"(uuid, text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_update_student_profile"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_update_student_profile"(uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_update_student_profile"(uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."auto_issue_course_certificate"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."auto_issue_course_certificate"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."auto_issue_course_certificate"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bump_course_completion_policy_version"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."bump_course_completion_policy_version"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."bump_course_completion_policy_version"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."capture_dcds_referral_on_signup"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."capture_dcds_referral_on_signup"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."capture_dcds_referral_on_signup"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."dcds_create_payout_request"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_create_payout_request"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_create_payout_request"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."dcds_log_payout_request_event"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_log_payout_request_event"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_log_payout_request_event"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."dcds_public_announcements_set_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."dcds_public_announcements_set_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_public_announcements_set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_public_announcements_set_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."dcds_reject_payout_event_mutation"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_reject_payout_event_mutation"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_reject_payout_event_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."dcds_reject_reward_event_mutation"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_reject_reward_event_mutation"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_reject_reward_event_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."dcds_reverse_referral_reward"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_reverse_referral_reward"(uuid, text, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_reverse_referral_reward"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."dcds_transition_payout"(uuid, text, text, text, uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_transition_payout"(uuid, text, text, text, uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."dcds_transition_payout"(uuid, text, text, text, uuid, jsonb) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_general_course_channels"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_general_course_channels"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_general_course_channels"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_general_course_channels"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_dcds_admin"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."is_dcds_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_dcds_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_dcds_admin"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."issue_course_certificate"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."issue_course_certificate"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."issue_course_certificate"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."issue_course_certificate"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_dcds_successful_course_order"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_dcds_successful_course_order"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_dcds_successful_course_order"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_dcds_announcement"(text, text, text, text, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."start_dcds_quiz"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."start_dcds_quiz"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."start_dcds_quiz"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."start_dcds_quiz"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."submit_dcds_quiz"(uuid, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."submit_dcds_quiz"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_dcds_quiz"(uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_dcds_quiz"(uuid, jsonb) TO "service_role";

REVOKE ALL ON SEQUENCE "public"."profiles_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."profiles_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."profiles_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."profiles_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."profiles_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."profiles_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."profiles_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."profiles_id_seq" TO "service_role";

REVOKE ALL ON TABLE "public"."admin_users" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_users" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_users" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assignment_submissions" TO "authenticated";

REVOKE ALL ON TABLE "public"."assignment_submissions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assignment_submissions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assignment_submissions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assignments" TO "authenticated";

REVOKE ALL ON TABLE "public"."assignments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assignments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assignments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."certificates" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."certificates" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."certificates" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."certificates" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."course_lessons" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."course_lessons" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."course_lessons" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."course_lessons" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."course_materials" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."course_materials" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."course_materials" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."course_materials" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."courses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."courses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."courses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."courses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_admins" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."dcds_admins" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_admins" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_admins" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_ambassadors" FROM "authenticated";

GRANT SELECT ON TABLE "public"."dcds_ambassadors" TO "authenticated";

REVOKE ALL ON TABLE "public"."dcds_ambassadors" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_ambassadors" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_ambassadors" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_general_course_channels" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_general_course_channels" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_general_course_channels" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_payout_accounts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_payout_accounts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_payout_accounts" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_payout_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_payout_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_payout_events" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_payout_requests" FROM "authenticated";

GRANT SELECT ON TABLE "public"."dcds_payout_requests" TO "authenticated";

REVOKE ALL ON TABLE "public"."dcds_payout_requests" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_payout_requests" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_payout_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_referrals" FROM "authenticated";

GRANT SELECT ON TABLE "public"."dcds_referrals" TO "authenticated";

REVOKE ALL ON TABLE "public"."dcds_referrals" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_referrals" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_referrals" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_reviews" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."dcds_reviews" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_reviews" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_reviews" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_reward_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_reward_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_reward_events" TO "service_role";

REVOKE ALL ON TABLE "public"."dcds_reward_ledger" FROM "authenticated";

GRANT SELECT ON TABLE "public"."dcds_reward_ledger" TO "authenticated";

REVOKE ALL ON TABLE "public"."dcds_reward_ledger" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_reward_ledger" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dcds_reward_ledger" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."enrollments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."enrollments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."enrollments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."enrollments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesson_progress" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."lesson_progress" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesson_progress" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesson_progress" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification_recipients" TO "anon";

REVOKE ALL ON TABLE "public"."notification_recipients" FROM "authenticated";

REVOKE ALL ("is_read") ON TABLE "public"."notification_recipients" FROM "authenticated";

GRANT UPDATE ("is_read") ON TABLE "public"."notification_recipients" TO "authenticated";

REVOKE ALL ("read_at") ON TABLE "public"."notification_recipients" FROM "authenticated";

GRANT UPDATE ("read_at") ON TABLE "public"."notification_recipients" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."notification_recipients" TO "authenticated";

REVOKE ALL ON TABLE "public"."notification_recipients" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification_recipients" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification_recipients" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."notifications" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."orders" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."payments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "service_role";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

REVOKE ALL ON TABLE "public"."public_announcements" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."public_announcements" TO "authenticated";

REVOKE ALL ON TABLE "public"."public_announcements" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_announcements" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_announcements" TO "service_role";

REVOKE ALL ON TABLE "public"."quiz_answer_keys" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."quiz_answer_keys" TO "authenticated";

REVOKE ALL ON TABLE "public"."quiz_answer_keys" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_answer_keys" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_answer_keys" TO "service_role";

REVOKE ALL ON TABLE "public"."quiz_attempt_answers" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."quiz_attempt_answers" TO "authenticated";

REVOKE ALL ON TABLE "public"."quiz_attempt_answers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_attempt_answers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_attempt_answers" TO "service_role";

REVOKE ALL ON TABLE "public"."quiz_attempts" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."quiz_attempts" TO "authenticated";

REVOKE ALL ON TABLE "public"."quiz_attempts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_attempts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_attempts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_questions" TO "authenticated";

REVOKE ALL ON TABLE "public"."quiz_questions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_questions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_questions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quizzes" TO "authenticated";

REVOKE ALL ON TABLE "public"."quizzes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quizzes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quizzes" TO "service_role";

REVOKE ALL ON TABLE "public"."student_admin_audit" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_admin_audit" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_admin_audit" TO "service_role";

REVOKE ALL ON TABLE "public"."student_admin_notes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_admin_notes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_admin_notes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_reviews" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."student_reviews" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_reviews" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_reviews" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_support_tickets" TO "anon";

REVOKE ALL ON TABLE "public"."student_support_tickets" FROM "authenticated";

REVOKE ALL ("category") ON TABLE "public"."student_support_tickets" FROM "authenticated";

GRANT INSERT ("category") ON TABLE "public"."student_support_tickets" TO "authenticated";

REVOKE ALL ("message") ON TABLE "public"."student_support_tickets" FROM "authenticated";

GRANT INSERT ("message") ON TABLE "public"."student_support_tickets" TO "authenticated";

REVOKE ALL ("subject") ON TABLE "public"."student_support_tickets" FROM "authenticated";

GRANT INSERT ("subject") ON TABLE "public"."student_support_tickets" TO "authenticated";

REVOKE ALL ("user_id") ON TABLE "public"."student_support_tickets" FROM "authenticated";

GRANT INSERT ("user_id") ON TABLE "public"."student_support_tickets" TO "authenticated";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_support_tickets" TO "authenticated";

REVOKE ALL ON TABLE "public"."student_support_tickets" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_support_tickets" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_support_tickets" TO "service_role";

