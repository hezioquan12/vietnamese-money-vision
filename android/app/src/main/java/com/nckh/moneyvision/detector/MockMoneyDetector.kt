package com.nckh.moneyvision.detector

/**
 * MockMoneyDetector.kt
 * Fallback detector for development and testing while the YOLO26 TFLite model is training.
 * Generates synthetic detection results with valid bounding boxes and Vietnamese currency items.
 */
class MockMoneyDetector {

    var currentScenario: String = "SINGLE_50K"
        private set

    fun setScenario(scenario: String) {
        currentScenario = scenario
    }

    fun detect(): DetectionResult {
        val startTime = System.currentTimeMillis()
        val boxes = getScenarioBoxes(currentScenario)
        val summary = aggregateBoxes(boxes)
        val inferenceTimeMs = (System.currentTimeMillis() - startTime).coerceAtLeast(1L)

        return DetectionResult(
            items = summary.items,
            boxes = boxes,
            totalAmount = summary.totalAmount,
            totalNotesCount = summary.totalNotesCount,
            hasMoney = summary.hasMoney,
            timestamp = System.currentTimeMillis(),
            inferenceTimeMs = inferenceTimeMs,
            isMock = true
        )
    }

    private fun getScenarioBoxes(scenario: String): List<DetectedBox> {
        return when (scenario) {
            "EMPTY" -> emptyList()

            "SINGLE_1K" -> listOf(createBox(1000L, 100f, 150f, 440f, 260f, 0.94f))
            "SINGLE_2K" -> listOf(createBox(2000L, 100f, 150f, 440f, 260f, 0.93f))
            "SINGLE_5K" -> listOf(createBox(5000L, 100f, 150f, 440f, 260f, 0.95f))
            "SINGLE_10K" -> listOf(createBox(10000L, 100f, 150f, 440f, 260f, 0.96f))
            "SINGLE_20K" -> listOf(createBox(20000L, 100f, 150f, 440f, 260f, 0.92f))
            "SINGLE_50K" -> listOf(createBox(50000L, 100f, 150f, 440f, 260f, 0.97f))
            "SINGLE_100K" -> listOf(createBox(100000L, 100f, 150f, 440f, 260f, 0.95f))
            "SINGLE_200K" -> listOf(createBox(200000L, 100f, 150f, 440f, 260f, 0.96f))
            "SINGLE_500K" -> listOf(createBox(500000L, 100f, 150f, 440f, 260f, 0.98f))

            "MULTI_NOTES" -> listOf(
                createBox(100000L, 60f, 80f, 400f, 220f, 0.95f),
                createBox(100000L, 180f, 200f, 400f, 220f, 0.91f),
                createBox(50000L, 120f, 380f, 380f, 210f, 0.89f)
            )

            "ALL_9_DENOMINATIONS" -> listOf(
                createBox(1000L, 50f, 50f, 200f, 120f, 0.88f),
                createBox(2000L, 260f, 50f, 200f, 120f, 0.89f),
                createBox(5000L, 470f, 50f, 200f, 120f, 0.90f),
                createBox(10000L, 50f, 180f, 200f, 120f, 0.91f),
                createBox(20000L, 260f, 180f, 200f, 120f, 0.92f),
                createBox(50000L, 470f, 180f, 200f, 120f, 0.93f),
                createBox(100000L, 50f, 310f, 200f, 120f, 0.94f),
                createBox(200000L, 260f, 310f, 200f, 120f, 0.95f),
                createBox(500000L, 470f, 310f, 200f, 120f, 0.96f)
            )

            else -> emptyList()
        }
    }

    fun isModelLoaded(): Boolean = false
    fun isMock(): Boolean = true

    private fun createBox(
        denomination: Long,
        x: Float,
        y: Float,
        w: Float,
        h: Float,
        score: Float
    ): DetectedBox {
        val classIndex = YOLO_CLASS_ORDER.indexOf(denomination).coerceAtLeast(0)
        val label = DENOMINATION_NAMES[denomination] ?: "$denomination VNĐ"
        return DetectedBox(
            x = x,
            y = y,
            width = w,
            height = h,
            cx = x + w / 2f,
            cy = y + h / 2f,
            score = score,
            classIndex = classIndex,
            denomination = denomination,
            label = label
        )
    }

    private fun aggregateBoxes(boxes: List<DetectedBox>): DetectionSummary {
        val counts = mutableMapOf<Long, Int>()
        for (box in boxes) {
            counts[box.denomination] = (counts[box.denomination] ?: 0) + 1
        }

        val sortedDenominations = listOf(
            500000L, 200000L, 100000L, 50000L, 20000L, 10000L, 5000L, 2000L, 1000L
        )

        val items = mutableListOf<DetectedMoneyItem>()
        var totalAmount = 0L
        var totalNotesCount = 0

        for (denom in sortedDenominations) {
            val count = counts[denom] ?: 0
            if (count > 0) {
                val denomTotal = denom * count
                totalAmount += denomTotal
                totalNotesCount += count
                items.add(
                    DetectedMoneyItem(
                        classId = denom,
                        count = count,
                        label = DENOMINATION_NAMES[denom] ?: "$denom VNĐ",
                        totalAmount = denomTotal
                    )
                )
            }
        }

        return DetectionSummary(
            items = items,
            boxes = boxes,
            totalAmount = totalAmount,
            totalNotesCount = totalNotesCount,
            hasMoney = totalNotesCount > 0
        )
    }
}
