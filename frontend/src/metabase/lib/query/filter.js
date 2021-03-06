/* @flow */

import {
  op,
  args,
  noNullValues,
  updateNested,
  removeNested,
  clear,
} from "./util";

import type {
  FilterClause,
  Filter,
  FilterOptions,
} from "metabase/meta/types/Query";

// returns canonical list of Filters
export function getFilters(filter: ?FilterClause): Filter[] {
  if (!filter || (Array.isArray(filter) && filter.length === 0)) {
    return [];
  } else if (op(filter) === "and" || op(filter) === "or") {
    return args(filter);
  } else {
    return [filter];
  }
}

function consolidateFilterClause(filter: FilterClause): any {
  // A simple filter, nothing to consolidate
  if (!isCompoundFilter(filter)) {
    if (filter.length === 1) {
      return filter[0];
    }
    return filter;
  }

  // We just removed a filter and have a compound filter with a single clause
  if (filter.length === 2) {
    return filter[1];
  }

  return [op(filter), ...args(filter).map(consolidateFilterClause)];
}

export function addFilter(clause: ?FilterClause, newFilter: FilterClause): any {
  if (!clause) {
    return newFilter; // The clause has a single filter, no operator needed
  }
  return isCompoundFilter(clause)
    ? [op(clause), ...args(clause), newFilter]
    : ["and", clause, newFilter];
}

export function updateFilter(
  filter: ?FilterClause,
  index: number[],
  updatedFilter: any,
): ?FilterClause {
  if (!filter) {
    return filter;
  }
  if (!isCompoundFilter(filter)) {
    return updatedFilter;
  }
  return consolidateFilterClause(updateNested(filter, index, updatedFilter));
}
export function removeFilter(
  filter: ?FilterClause,
  index: number[],
): ?FilterClause {
  if (!filter) {
    return filter;
  }
  if (isCompoundFilter(filter)) {
    return consolidateFilterClause(removeNested(filter, index));
  }

  return undefined;
}
export function clearFilters(filter: ?FilterClause): ?FilterClause {
  return consolidateFilterClause(clear());
}

export function toggleCompoundFilterOperator(
  clause: any,
  operatorIndex: number,
  nestedClauseIndex: number[],
): any {
  // go down in the nested statements
  let filterToToggle = clause;
  let parentClause = null;
  for (const i of nestedClauseIndex) {
    parentClause = filterToToggle;
    filterToToggle = [...filterToToggle[i]];
  }

  const newOperator = op(filterToToggle) === "and" ? "or" : "and";
  const filterArgs = args(filterToToggle);
  let lhs = [filterArgs[operatorIndex]];
  if (isCompoundFilter(lhs[0]) && op(lhs[0]) === newOperator) {
    lhs = args(lhs[0]);
  }
  let rhs = [filterArgs[operatorIndex + 1]];
  if (isCompoundFilter(rhs[0]) && op(rhs[0]) === newOperator) {
    rhs = args(rhs[0]);
  }

  let newFilter;

  if (filterToToggle.length > 3) {
    newFilter = [
      op(filterToToggle),
      ...filterArgs.slice(0, operatorIndex),
      [newOperator, ...lhs, ...rhs],
      ...filterArgs.slice(operatorIndex + 2),
    ];
  } else {
    newFilter = [newOperator, ...lhs, ...rhs];

    if (parentClause && op(parentClause) === newOperator) {
      const indexToExpand = nestedClauseIndex[nestedClauseIndex.length - 1];
      // The curent clause should be expanded in the parent
      return updateFilter(
        clause,
        nestedClauseIndex.slice(0, nestedClauseIndex.length - 1),
        [
          ...parentClause.slice(0, indexToExpand),
          ...args(newFilter),
          ...parentClause.slice(indexToExpand + 1),
        ],
      );
    }
  }
  return updateFilter(clause, nestedClauseIndex, newFilter);
}

// MISC

export function canAddFilter(filter: ?FilterClause): boolean {
  const filters = getFilters(filter);
  if (filters.length > 0) {
    return noNullValues(filters[filters.length - 1]);
  }
  return true;
}

export function isSegmentFilter(filter: FilterClause): boolean {
  return Array.isArray(filter) && filter[0] === "segment";
}

export function isCompoundFilter(filter: any): boolean {
  return Array.isArray(filter) && (filter[0] === "and" || filter[0] === "or");
}

export function isFieldFilter(filter: FilterClause): boolean {
  return !isSegmentFilter(filter) && !isCompoundFilter(filter);
}

// TODO: is it safe to assume if the last item is an object then it's options?
export function hasFilterOptions(filter: Filter): boolean {
  const o = filter[filter.length - 1];
  return !!o && typeof o == "object" && o.constructor == Object;
}

export function getFilterOptions(filter: Filter): FilterOptions {
  // NOTE: just make a new "any" variable since getting flow to type checking this is a nightmare
  const _filter: any = filter;
  if (hasFilterOptions(filter)) {
    return _filter[_filter.length - 1];
  } else {
    return {};
  }
}

export function setFilterOptions<T: Filter>(
  filter: T,
  options: FilterOptions,
): T {
  // NOTE: just make a new "any" variable since getting flow to type checking this is a nightmare
  let _filter: any = filter;
  // if we have option, strip it off for now
  if (hasFilterOptions(filter)) {
    _filter = _filter.slice(0, -1);
  }
  // if options isn't emtpy, append it
  if (Object.keys(options).length > 0) {
    _filter = [..._filter, options];
  }
  return _filter;
}
