package com.movieroom.shell;

import java.util.List;

/** Deterministic focus movement that never falls back to Android geometry search. */
public final class FocusGrid {
    public static final class Position {
        public final int row;
        public final int column;

        public Position(int row, int column) {
            this.row = row;
            this.column = column;
        }
    }

    private FocusGrid() {}

    public static Position nextPosition(List<? extends List<?>> rows, int row, int column, RemoteMap.Action action) {
        if (rows == null || rows.isEmpty()) return new Position(0, 0);
        int safeRow = Math.max(0, Math.min(row, rows.size() - 1));
        int safeColumn = Math.max(0, Math.min(column, Math.max(0, rows.get(safeRow).size() - 1)));
        int nextRow = safeRow;
        int nextColumn = safeColumn;
        if (action == RemoteMap.Action.LEFT) nextColumn--;
        if (action == RemoteMap.Action.RIGHT) nextColumn++;
        if (action == RemoteMap.Action.UP) nextRow--;
        if (action == RemoteMap.Action.DOWN) nextRow++;
        nextRow = Math.max(0, Math.min(nextRow, rows.size() - 1));
        if (rows.get(nextRow).isEmpty()) return new Position(nextRow, 0);
        nextColumn = Math.max(0, Math.min(nextColumn, rows.get(nextRow).size() - 1));
        return new Position(nextRow, nextColumn);
    }
}
