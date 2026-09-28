-- pg_trgm: similitud de nombres para la deduplicación entre plataformas (AGENT_BRIEF §7.4).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('BOOKING', 'AIRBNB', 'GOOGLE_HOTELS', 'TRIPADVISOR', 'XOTELO', 'EXPEDIA', 'VRBO', 'AGODA', 'DESPEGAR');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOTEL', 'APARTMENT', 'HOUSE', 'CABIN', 'HOSTEL', 'VILLA', 'OTHER');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'OK', 'PARTIAL', 'BLOCKED', 'BLOCKED_BY_ROBOTS', 'FAILED');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "starRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "propertyId" TEXT,
    "name" TEXT,
    "rating" DOUBLE PRECISION,
    "ratingScale" DOUBLE PRECISION,
    "rating10" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "maxGuests" INTEGER,
    "bedrooms" INTEGER,
    "rawAmenities" TEXT[],
    "rawDetail" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amenity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelEs" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isFamily" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmenityAlias" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "rawLabel" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,

    CONSTRAINT "AmenityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAmenity" (
    "propertyId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,
    "isFree" BOOLEAN,

    CONSTRAINT "PropertyAmenity_pkey" PRIMARY KEY ("propertyId","amenityId")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "destination" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "childAges" INTEGER[],
    "currency" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "stats" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawPayload" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "body" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawPayload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "listingId" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "roomName" TEXT,
    "nightlyPrice" DECIMAL(12,2),
    "totalPrice" DECIMAL(12,2),
    "taxesIncluded" BOOLEAN,
    "fees" JSONB,
    "currency" TEXT NOT NULL,
    "freeCancellation" BOOLEAN,
    "breakfastIncluded" BOOLEAN,
    "provider" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityDay" (
    "listingId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "available" BOOLEAN NOT NULL,
    "minNights" INTEGER,
    "price" DECIMAL(12,2),
    "currency" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityDay_pkey" PRIMARY KEY ("listingId","date","capturedAt")
);

-- CreateIndex
CREATE INDEX "Property_city_country_idx" ON "Property"("city", "country");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_platform_externalId_key" ON "Listing"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Amenity_code_key" ON "Amenity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AmenityAlias_platform_rawLabel_key" ON "AmenityAlias"("platform", "rawLabel");

-- CreateIndex
CREATE INDEX "RawPayload_searchRunId_kind_idx" ON "RawPayload"("searchRunId", "kind");

-- CreateIndex
CREATE INDEX "PriceSnapshot_listingId_checkIn_checkOut_capturedAt_idx" ON "PriceSnapshot"("listingId", "checkIn", "checkOut", "capturedAt");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmenityAlias" ADD CONSTRAINT "AmenityAlias_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAmenity" ADD CONSTRAINT "PropertyAmenity_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAmenity" ADD CONSTRAINT "PropertyAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawPayload" ADD CONSTRAINT "RawPayload_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityDay" ADD CONSTRAINT "AvailabilityDay_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
