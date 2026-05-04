import { useState } from "react";
import { Search, Download, Settings, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TableHeaderProps {
  title: string;
  count: number;
  description?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onExport?: () => void;
  showColumnToggle?: boolean;
  columns?: Array<{ id: string; label: string }>;
  visibleColumns?: Set<string>;
  onColumnsChange?: (columns: Set<string>) => void;
  filterOptions?: Array<{ label: string; value: string }>;
  onFilterChange?: (value: string) => void;
  filterValue?: string;
  additionalActions?: React.ReactNode;
}

export default function TableHeader({
  title,
  count,
  description,
  searchPlaceholder = "Search...",
  onSearchChange,
  onExport,
  showColumnToggle = true,
  columns = [],
  visibleColumns,
  onColumnsChange,
  filterOptions,
  onFilterChange,
  filterValue,
  additionalActions,
}: TableHeaderProps) {
  const [searchValue, setSearchValue] = useState("");

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearchChange?.(value);
  };

  return (
    <div className="space-y-4 mb-6">
      {/* Title and Count */}
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground font-caslon">{title}</h1>
        <span className="text-sm font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
          {count}
        </span>
        {description && (
          <p className="text-sm text-muted-foreground ml-auto">{description}</p>
        )}
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search Input */}
        {onSearchChange && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-9 bg-muted/40 border-border/40 focus:border-primary/50"
            />
          </div>
        )}

        {/* Filter Dropdown */}
        {filterOptions && filterOptions.length > 0 && onFilterChange && (
          <Select value={filterValue || "__all__"} onValueChange={(val) => onFilterChange(val === "__all__" ? "" : val)}>
            <SelectTrigger className="w-[140px] h-9 bg-muted/40 border-border/40 focus:border-primary/50">
              <SelectValue placeholder="Filter..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Items</SelectItem>
              {filterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Additional Actions */}
        {additionalActions && <div className="flex items-center gap-2">{additionalActions}</div>}

        <div className="flex items-center gap-1 ml-auto">
          {/* Export Button */}
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="h-9 px-3 gap-2 bg-muted/40 border-border/40 hover:bg-muted/60"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}

          {/* Columns Toggle */}
          {showColumnToggle && columns.length > 0 && visibleColumns && onColumnsChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 gap-2 bg-muted/40 border-border/40 hover:bg-muted/60"
                >
                  <Settings className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-sm font-medium text-foreground">Show Columns</div>
                <DropdownMenuSeparator />
                {columns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={visibleColumns.has(column.id)}
                    onCheckedChange={(checked) => {
                      const newColumns = new Set(visibleColumns);
                      if (checked) {
                        newColumns.add(column.id);
                      } else {
                        newColumns.delete(column.id);
                      }
                      onColumnsChange(newColumns);
                    }}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
