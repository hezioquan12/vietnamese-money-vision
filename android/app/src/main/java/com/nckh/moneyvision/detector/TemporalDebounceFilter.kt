package com.nckh.moneyvision.detector

import java.util.ArrayDeque

/**
 * DebounceState
 * Represents the 3-state temporal debounce state machine:
 * - EMPTY: No money detected in frame or money removed
 * - STABILIZING: Transitioning or accumulating consensus votes
 * - STABLE: 4/5 frames consensus achieved on money denomination(s)
 */
enum class DebounceState {
    EMPTY,
    STABILIZING,
    STABLE
}

data class DebouncedResult(
    val result: DetectionResult,
    val state: DebounceState,
    val stateChanged: Boolean,
    val isEmptied: Boolean,
    val signature: String,
    val consensusCount: Int,
    val candidateSignature: String,
    val candidateCount: Int,
    val consecutiveEmptyFrames: Int,
    val windowSize: Int
) {
    val hasMoney: Boolean get() = result.hasMoney
}

/**
 * TemporalDebounceFilter
 * Native 5-Frame Sliding Window Majority Vote Temporal Debounce Filter.
 * Executes on background inference executor prior to dispatching events to React Native.
 * Filters out jitter, hand tremor, and false negative single-frame dropouts.
 */
class TemporalDebounceFilter(
    val windowSize: Int = 5,
    val minConsensus: Int = 4,
    val emptyThreshold: Int = 3
) {
    private data class WindowEntry(val frame: DetectionResult, val signature: String)

    private val window = ArrayDeque<WindowEntry>()
    private val voteCounts = mutableMapOf<String, Int>()
    private val resultsBySig = mutableMapOf<String, DetectionResult>()
    private var consecutiveEmptyFrames = 0
    private var currentState = DebounceState.EMPTY
    private var currentStableSignature = "EMPTY"
    private var currentStableResult: DetectionResult = createEmptyResult()

    companion object {
        fun computeSignature(items: List<DetectedMoneyItem>?): String {
            if (items == null || items.isEmpty()) return "EMPTY"
            var hasActive = false
            for (i in 0 until items.size) {
                if (items[i].count > 0) {
                    hasActive = true
                    break
                }
            }
            if (!hasActive) return "EMPTY"

            val map = mutableMapOf<Long, Int>()
            for (i in 0 until items.size) {
                val item = items[i]
                if (item.count > 0) {
                    map[item.classId] = (map[item.classId] ?: 0) + item.count
                }
            }

            return map.entries
                .sortedBy { it.key }
                .joinToString("|") { "${it.key}:${it.value}" }
        }

        fun createEmptyResult(timestamp: Long = System.currentTimeMillis()): DetectionResult {
            return DetectionResult(
                items = emptyList(),
                boxes = emptyList(),
                totalAmount = 0L,
                totalNotesCount = 0,
                hasMoney = false,
                timestamp = timestamp,
                inferenceTimeMs = 0L,
                isMock = false
            )
        }
    }

    @Synchronized
    fun process(frame: DetectionResult): DebouncedResult {
        val frameSig = computeSignature(frame.items)
        if (frameSig == "EMPTY") {
            consecutiveEmptyFrames++
        } else {
            consecutiveEmptyFrames = 0
        }

        if (window.size >= windowSize) {
            val popped = window.removeFirst()
            val c = (voteCounts[popped.signature] ?: 1) - 1
            if (c <= 0) {
                voteCounts.remove(popped.signature)
                resultsBySig.remove(popped.signature)
            } else {
                voteCounts[popped.signature] = c
            }
        }

        window.addLast(WindowEntry(frame, frameSig))
        voteCounts[frameSig] = (voteCounts[frameSig] ?: 0) + 1
        resultsBySig[frameSig] = frame

        var winningSig = "EMPTY"
        var winningCount = 0
        for ((sig, count) in voteCounts) {
            if (count > winningCount) {
                winningCount = count
                winningSig = sig
            }
        }

        val oldStableSig = currentStableSignature
        var stateChanged = false
        var isEmptied = false

        if (
            consecutiveEmptyFrames >= emptyThreshold ||
            (winningSig == "EMPTY" && winningCount >= minConsensus) ||
            (oldStableSig == "EMPTY" && winningSig == "EMPTY")
        ) {
            currentState = DebounceState.EMPTY
            if (oldStableSig != "EMPTY") {
                currentStableSignature = "EMPTY"
                currentStableResult = createEmptyResult(frame.timestamp)
                stateChanged = true
                isEmptied = true
            }
        } else if (winningSig != "EMPTY" && winningCount >= minConsensus) {
            currentState = DebounceState.STABLE
            if (winningSig != oldStableSig) {
                currentStableSignature = winningSig
                currentStableResult = resultsBySig[winningSig] ?: frame
                stateChanged = true
                isEmptied = false
            } else {
                currentStableResult = resultsBySig[winningSig] ?: frame
                stateChanged = false
                isEmptied = false
            }
        } else {
            currentState = DebounceState.STABILIZING
            stateChanged = false
            isEmptied = false
        }

        return DebouncedResult(
            result = currentStableResult,
            state = currentState,
            stateChanged = stateChanged,
            isEmptied = isEmptied,
            signature = currentStableSignature,
            consensusCount = if (winningSig == currentStableSignature) winningCount else 0,
            candidateSignature = winningSig,
            candidateCount = winningCount,
            consecutiveEmptyFrames = consecutiveEmptyFrames,
            windowSize = window.size
        )
    }

    @Synchronized
    fun reset() {
        window.clear()
        voteCounts.clear()
        resultsBySig.clear()
        consecutiveEmptyFrames = 0
        currentState = DebounceState.EMPTY
        currentStableSignature = "EMPTY"
        currentStableResult = createEmptyResult()
    }

    fun getState(): DebounceState = currentState
    fun getStableSignature(): String = currentStableSignature
    fun getStableResult(): DetectionResult = currentStableResult
    fun getConsecutiveEmptyFrames(): Int = consecutiveEmptyFrames
}
