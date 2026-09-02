package com.altuscorp.altus.data.local

import androidx.room.TypeConverter
import com.altuscorp.altus.data.local.entity.MutationKind
import java.time.Instant

/**
 * Room type converters. Instants persist as epoch millis (sortable, zoneless);
 * [MutationKind] persists by name so an outbox row written today replays
 * correctly after any app update that appends new kinds.
 */
class Converters {

    @TypeConverter
    fun instantToEpochMs(value: Instant?): Long? = value?.toEpochMilli()

    @TypeConverter
    fun epochMsToInstant(value: Long?): Instant? = value?.let(Instant::ofEpochMilli)

    @TypeConverter
    fun mutationKindToString(value: MutationKind?): String? = value?.name

    @TypeConverter
    fun stringToMutationKind(value: String?): MutationKind? =
        value?.let { raw -> MutationKind.entries.firstOrNull { it.name == raw } }
}
