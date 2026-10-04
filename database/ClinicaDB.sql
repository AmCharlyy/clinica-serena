IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NULL,
        [Username] nvarchar(max) NOT NULL,
        [Action] nvarchar(max) NOT NULL,
        [Entity] nvarchar(max) NOT NULL,
        [RecordId] nvarchar(max) NOT NULL,
        [Ip] nvarchar(max) NOT NULL,
        [Result] nvarchar(max) NOT NULL,
        [Detail] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Backups] (
        [Id] int NOT NULL IDENTITY,
        [RequestedBy] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Provider] nvarchar(max) NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Size] bigint NOT NULL,
        [Detail] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Backups] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Companies] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(180) NOT NULL,
        [Rfc] nvarchar(13) NOT NULL,
        [Contact] nvarchar(180) NOT NULL,
        [Email] nvarchar(180) NOT NULL,
        [Phone] nvarchar(30) NOT NULL,
        [ValidUntil] date NULL,
        [Agreement] nvarchar(2000) NOT NULL,
        [Active] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Companies] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Facilities] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(100) NOT NULL,
        [Kind] nvarchar(30) NOT NULL,
        [Location] nvarchar(80) NOT NULL,
        [Status] nvarchar(30) NOT NULL,
        [Active] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Facilities] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Notifications] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [Title] nvarchar(max) NOT NULL,
        [Message] nvarchar(max) NOT NULL,
        [Read] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Notifications] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Roles] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(80) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [Permissions] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Roles] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Services] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(160) NOT NULL,
        [Specialty] nvarchar(80) NOT NULL,
        [DurationMinutes] int NOT NULL,
        [Price] decimal(18,2) NOT NULL,
        [Active] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Services] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Settings] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(180) NOT NULL,
        [Address] nvarchar(300) NOT NULL,
        [Phone] nvarchar(30) NOT NULL,
        [Email] nvarchar(180) NOT NULL,
        [CancellationHours] int NOT NULL,
        [OpeningHour] int NOT NULL,
        [ClosingHour] int NOT NULL,
        [TimeZone] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Settings] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Staff] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(180) NOT NULL,
        [Kind] nvarchar(30) NOT NULL,
        [Specialty] nvarchar(100) NOT NULL,
        [License] nvarchar(40) NOT NULL,
        [Phone] nvarchar(30) NOT NULL,
        [Email] nvarchar(180) NOT NULL,
        [StartsAt] time NOT NULL,
        [EndsAt] time NOT NULL,
        [WorkingDays] nvarchar(30) NOT NULL,
        [Active] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Staff] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Patients] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(180) NOT NULL,
        [Curp] nvarchar(18) NOT NULL,
        [BirthDate] date NOT NULL,
        [Sex] nvarchar(30) NOT NULL,
        [Phone] nvarchar(30) NOT NULL,
        [Email] nvarchar(180) NOT NULL,
        [Address] nvarchar(300) NOT NULL,
        [EmergencyContact] nvarchar(180) NOT NULL,
        [CompanyId] int NULL,
        [Active] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Patients] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Patients_Companies_CompanyId] FOREIGN KEY ([CompanyId]) REFERENCES [Companies] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Appointments] (
        [Id] int NOT NULL IDENTITY,
        [PatientId] int NOT NULL,
        [DoctorId] int NOT NULL,
        [FacilityId] int NOT NULL,
        [ServiceId] int NOT NULL,
        [Date] date NOT NULL,
        [Time] time NOT NULL,
        [DurationMinutes] int NOT NULL,
        [Status] nvarchar(30) NOT NULL,
        [Reason] nvarchar(1000) NOT NULL,
        [Notes] nvarchar(2000) NOT NULL,
        [CheckedInAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Appointments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Appointments_Facilities_FacilityId] FOREIGN KEY ([FacilityId]) REFERENCES [Facilities] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Appointments_Patients_PatientId] FOREIGN KEY ([PatientId]) REFERENCES [Patients] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Appointments_Services_ServiceId] FOREIGN KEY ([ServiceId]) REFERENCES [Services] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Appointments_Staff_DoctorId] FOREIGN KEY ([DoctorId]) REFERENCES [Staff] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Documents] (
        [Id] int NOT NULL IDENTITY,
        [PatientId] int NOT NULL,
        [UploadedBy] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Category] nvarchar(max) NOT NULL,
        [StoredName] nvarchar(max) NOT NULL,
        [ContentType] nvarchar(max) NOT NULL,
        [Hash] nvarchar(max) NOT NULL,
        [Size] bigint NOT NULL,
        [Released] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Documents] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Documents_Patients_PatientId] FOREIGN KEY ([PatientId]) REFERENCES [Patients] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] int NOT NULL IDENTITY,
        [Username] nvarchar(80) NOT NULL,
        [Name] nvarchar(180) NOT NULL,
        [Email] nvarchar(180) NOT NULL,
        [PasswordHash] nvarchar(max) NOT NULL,
        [Roles] nvarchar(max) NOT NULL,
        [Active] bit NOT NULL,
        [MustChangePassword] bit NOT NULL,
        [FailedAttempts] int NOT NULL,
        [LockedUntil] datetime2 NULL,
        [LastAccess] datetime2 NULL,
        [PatientId] int NULL,
        [DoctorId] int NULL,
        [CompanyId] int NULL,
        [SecurityStamp] uniqueidentifier NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Users_Companies_CompanyId] FOREIGN KEY ([CompanyId]) REFERENCES [Companies] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Users_Patients_PatientId] FOREIGN KEY ([PatientId]) REFERENCES [Patients] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Users_Staff_DoctorId] FOREIGN KEY ([DoctorId]) REFERENCES [Staff] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [AppointmentChanges] (
        [Id] int NOT NULL IDENTITY,
        [AppointmentId] int NOT NULL,
        [UserId] int NOT NULL,
        [Action] nvarchar(max) NOT NULL,
        [Detail] nvarchar(max) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AppointmentChanges] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AppointmentChanges_Appointments_AppointmentId] FOREIGN KEY ([AppointmentId]) REFERENCES [Appointments] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [ClinicalNotes] (
        [Id] int NOT NULL IDENTITY,
        [PatientId] int NOT NULL,
        [DoctorId] int NOT NULL,
        [AppointmentId] int NULL,
        [AuthorId] int NOT NULL,
        [History] nvarchar(4000) NOT NULL,
        [Allergies] nvarchar(2000) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [Diagnosis] nvarchar(4000) NOT NULL,
        [Treatment] nvarchar(4000) NOT NULL,
        [SignedAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_ClinicalNotes] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ClinicalNotes_Appointments_AppointmentId] FOREIGN KEY ([AppointmentId]) REFERENCES [Appointments] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ClinicalNotes_Patients_PatientId] FOREIGN KEY ([PatientId]) REFERENCES [Patients] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ClinicalNotes_Staff_DoctorId] FOREIGN KEY ([DoctorId]) REFERENCES [Staff] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Payments] (
        [Id] int NOT NULL IDENTITY,
        [PatientId] int NOT NULL,
        [AppointmentId] int NULL,
        [RecordedBy] int NOT NULL,
        [Concept] nvarchar(240) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Method] nvarchar(30) NOT NULL,
        [Status] nvarchar(30) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Payments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Payments_Appointments_AppointmentId] FOREIGN KEY ([AppointmentId]) REFERENCES [Appointments] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Payments_Patients_PatientId] FOREIGN KEY ([PatientId]) REFERENCES [Patients] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE TABLE [Invoices] (
        [Id] int NOT NULL IDENTITY,
        [PaymentId] int NOT NULL,
        [IssuedBy] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_Invoices] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Invoices_Payments_PaymentId] FOREIGN KEY ([PaymentId]) REFERENCES [Payments] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_AppointmentChanges_AppointmentId] ON [AppointmentChanges] ([AppointmentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Appointments_Date_DoctorId] ON [Appointments] ([Date], [DoctorId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Appointments_Date_FacilityId] ON [Appointments] ([Date], [FacilityId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Appointments_Date_PatientId] ON [Appointments] ([Date], [PatientId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Appointments_DoctorId] ON [Appointments] ([DoctorId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Appointments_FacilityId] ON [Appointments] ([FacilityId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Appointments_PatientId] ON [Appointments] ([PatientId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Appointments_ServiceId] ON [Appointments] ([ServiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_CreatedAt] ON [AuditLogs] ([CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_ClinicalNotes_AppointmentId] ON [ClinicalNotes] ([AppointmentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_ClinicalNotes_DoctorId] ON [ClinicalNotes] ([DoctorId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_ClinicalNotes_PatientId] ON [ClinicalNotes] ([PatientId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Documents_PatientId] ON [Documents] ([PatientId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Invoices_PaymentId] ON [Invoices] ([PaymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Patients_CompanyId] ON [Patients] ([CompanyId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Patients_Curp] ON [Patients] ([Curp]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Payments_AppointmentId] ON [Payments] ([AppointmentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Payments_PatientId] ON [Payments] ([PatientId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Roles_Name] ON [Roles] ([Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Users_CompanyId] ON [Users] ([CompanyId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Users_DoctorId] ON [Users] ([DoctorId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE INDEX [IX_Users_PatientId] ON [Users] ([PatientId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Username] ON [Users] ([Username]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003004015_InitialClinic'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261003004015_InitialClinic', N'10.0.0');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Roles] ADD [Audience] nvarchar(20) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Roles] ADD [PolicyVersion] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Payments] ADD [CompanyId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Documents] ADD [CompanyId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Appointments] ADD [CompanyId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Appointments] ADD [Instructions] nvarchar(2000) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    CREATE INDEX [IX_Payments_CompanyId] ON [Payments] ([CompanyId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    CREATE INDEX [IX_Documents_CompanyId] ON [Documents] ([CompanyId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    CREATE INDEX [IX_Appointments_CompanyId] ON [Appointments] ([CompanyId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Appointments] ADD CONSTRAINT [FK_Appointments_Companies_CompanyId] FOREIGN KEY ([CompanyId]) REFERENCES [Companies] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Documents] ADD CONSTRAINT [FK_Documents_Companies_CompanyId] FOREIGN KEY ([CompanyId]) REFERENCES [Companies] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    ALTER TABLE [Payments] ADD CONSTRAINT [FK_Payments_Companies_CompanyId] FOREIGN KEY ([CompanyId]) REFERENCES [Companies] ([Id]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003200635_RolePortalsAndCoverage'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261003200635_RolePortalsAndCoverage', N'10.0.0');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [Users] ADD [AccessExpiresAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [Users] ADD [AccessReviewedAt] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [Users] ADD [LastTotpStep] bigint NOT NULL DEFAULT CAST(0 AS bigint);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [Users] ADD [MfaEnabled] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [Users] ADD [MfaFailures] int NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [Users] ADD [MfaSecret] nvarchar(max) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [Users] ADD [SharedWorkstation] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    ALTER TABLE [AuditLogs] ADD [Seal] nvarchar(max) NOT NULL DEFAULT N'';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    CREATE TABLE [AuthSessions] (
        [Id] int NOT NULL IDENTITY,
        [SessionId] uniqueidentifier NOT NULL,
        [UserId] int NOT NULL,
        [Stage] nvarchar(20) NOT NULL,
        [LastActivityAt] datetime2 NOT NULL,
        [AbsoluteExpiresAt] datetime2 NOT NULL,
        [RevokedAt] datetime2 NULL,
        [ReauthenticatedAt] datetime2 NULL,
        [Ip] nvarchar(100) NOT NULL,
        [UserAgent] nvarchar(300) NOT NULL,
        [EnrollmentSecret] nvarchar(max) NOT NULL,
        [EnrollmentExpiresAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_AuthSessions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AuthSessions_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    CREATE TABLE [RecoveryCodes] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [Hash] nvarchar(64) NOT NULL,
        [UsedAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_RecoveryCodes] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_RecoveryCodes_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    CREATE TABLE [SecureDrafts] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [DraftKey] nvarchar(200) NOT NULL,
        [AccessFingerprint] nvarchar(64) NOT NULL,
        [Ciphertext] nvarchar(max) NOT NULL,
        [ExpiresAt] datetime2 NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [Version] uniqueidentifier NOT NULL,
        CONSTRAINT [PK_SecureDrafts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_SecureDrafts_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AuthSessions_SessionId] ON [AuthSessions] ([SessionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    CREATE INDEX [IX_AuthSessions_UserId] ON [AuthSessions] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    CREATE UNIQUE INDEX [IX_RecoveryCodes_UserId_Hash] ON [RecoveryCodes] ([UserId], [Hash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    CREATE UNIQUE INDEX [IX_SecureDrafts_UserId_DraftKey] ON [SecureDrafts] ([UserId], [DraftKey]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261003233019_SecuritySessionsAndTotp'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261003233019_SecuritySessionsAndTotp', N'10.0.0');
END;

COMMIT;
GO

