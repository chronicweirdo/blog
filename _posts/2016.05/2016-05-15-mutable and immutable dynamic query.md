---
title: 'Mutable to immutable, with JPA'
date: 2016-05-15 20:22:00 BST
tags: ['java', 'jpa', 'criteria query', 'immutable objects']
---

Following is an example of building a dynamic query object using a mutable implementation at first, then converting it to an immutable implementation. Immutability introduces clarity of code since object functions don't produce side-effects.

## The Query interface

~~~ java
public interface Query<T> {

    Query<T> like(String fieldName, Object parameterValue);
    Query<T> greaterThanOrEqualTo(String fieldName, Object limit);
    Query<T> lessThanOrEqualTo(String fieldName, Object limit);
    Query<T> equal(String fieldName, Object value);
    Query<T> has(String fieldName);
    Query<T> doesNotHave(String fieldName);
    Query<T> pageStart(Integer pageStart);
    Query<T> pageNumber(Integer pageNr);
    Query<T> pageSize(Integer pageSize);
    Query<T> asc(String fieldName);
    Query<T> desc(String fieldName);

    List<T> run();
}
~~~

## The Query manager

~~~ java
@Component
public class QueryManager {

    @Autowired
    private EntityManager entityManager;

    public <T> Query<T> query(Class<T> clazz) {
        return new ImmutableQuery<>(entityManager, clazz);
    }
}
~~~

## The mutable class, in all its ugliness

~~~ java
public class MutableQuery<T> implements Query {

    public static final String GTE_SUFFIX = "GTE";
    public static final String LTE_SUFFIX = "LTE";
    private final CriteriaBuilder criteriaBuilder;
    private EntityManager entityManager;
    private Class<T> rootClass;
    private final CriteriaQuery<T> criteriaQuery;
    private final Root<T> root;
    private Map<String, Object> parameters = new HashMap<>();
    private Integer pageStart = 0;
    private Integer pageSize = 10;
    private Predicate predicate;

    protected MutableQuery(EntityManager entityManager, Class<T> rootClass) {
        this.entityManager = entityManager;
        criteriaBuilder = entityManager.getCriteriaBuilder();
        this.rootClass = rootClass;

        criteriaQuery = criteriaBuilder.createQuery(rootClass);
        root = criteriaQuery.from(rootClass);
        criteriaQuery.select(root);
    }

    private Predicate getPredicate() {
        if (predicate == null) {
            predicate = criteriaBuilder.conjunction();
        }
        return predicate;
    }

    private void add(Predicate expression) {
        getPredicate().getExpressions().add(expression);
    }

    public MutableQuery<T> like(String fieldName, Object parameterValue) {
        if (fieldName != null && parameterValue != null) {
            String parameterName = fieldName;
            parameters.put(parameterName, parameterValue);
            ParameterExpression requestParameter = criteriaBuilder.parameter(getFieldClass(rootClass, fieldName), parameterName);
            add(criteriaBuilder.like(root.get(fieldName), requestParameter));
        }
        return this;
    }

    public MutableQuery<T> greaterThanOrEqualTo(String fieldName, Object limit) {
        if (fieldName != null && limit != null) {
            String parameterName = fieldName + GTE_SUFFIX;
            parameters.put(parameterName, limit);
            ParameterExpression parameter = criteriaBuilder.parameter(getFieldClass(rootClass, fieldName), parameterName);
            add(criteriaBuilder.greaterThanOrEqualTo(root.get(fieldName), parameter));
        }
        return this;
    }

    public MutableQuery<T> lessThanOrEqualTo(String fieldName, Object limit) {
        if (fieldName != null && limit != null) {
            String parameterName = fieldName + LTE_SUFFIX;
            parameters.put(parameterName, limit);
            ParameterExpression parameter = criteriaBuilder.parameter(getFieldClass(rootClass, fieldName), parameterName);
            add(criteriaBuilder.lessThanOrEqualTo(root.get(fieldName), parameter));
        }
        return this;
    }

    public MutableQuery<T> equal(String fieldName, Object value) {
        if (fieldName != null && value != null) {
            String parameterName = fieldName;
            parameters.put(parameterName, value);
            ParameterExpression parameter = criteriaBuilder.parameter(getFieldClass(rootClass, fieldName), parameterName);
            add(criteriaBuilder.equal(root.get(fieldName), parameter));
        }
        return this;
    }

    public MutableQuery<T> has(String fieldName) {
        if (fieldName != null) {
            add(criteriaBuilder.isNotNull(root.get(fieldName)));
        }
        return this;
    }

    public MutableQuery<T> doesNotHave(String fieldName) {
        if (fieldName != null) {
            add(criteriaBuilder.isNull(root.get(fieldName)));
        }
        return this;
    }

    private Class getFieldClass(Class<T> rootClass, String fieldName) {
        try {
            return rootClass.getDeclaredField(fieldName).getType();
        } catch (NoSuchFieldException e) {
            return null;
        }
    }

    public MutableQuery<T> pageStart(Integer pageStart) {
        if (pageStart != null) {
            this.pageStart = pageStart;
        }
        return this;
    }

    public MutableQuery<T> pageNumber(Integer pageNr) {
        if (pageNr != null) {
            this.pageStart = pageNr * pageSize;
        }
        return this;
    }

    public MutableQuery<T> pageSize(Integer pageSize) {
        if (pageSize != null) {
            this.pageSize = pageSize;
        }
        return this;
    }

    public MutableQuery<T> asc(String fieldName) {
        if (fieldName != null) {
            criteriaQuery.getOrderList().add(criteriaBuilder.asc(root.get(fieldName)));
        }
        return this;
    }

    public MutableQuery<T> desc(String fieldName) {
        if (fieldName != null) {
            criteriaQuery.getOrderList().add(criteriaBuilder.desc(root.get(fieldName)))
        }
        return this;
    }

    public List<T> run() {
        if (predicate != null) {
            criteriaQuery.where(predicate);
        }

        TypedQuery<T> q = entityManager.createQuery(criteriaQuery);
        q.setFirstResult(pageStart);
        q.setMaxResults(pageSize);
        parameters.forEach((name, value) -> q.setParameter(name, value));
        return q.getResultList();
    }
}
~~~

## The immutable class, in all its beauty.

~~~ java
public class ImmutableQuery<T> implements Query {

    public static final String GTE = "GTE";
    public static final String LTE = "LTE";

    private class QueryTerm {
        private String expression;
        private String field;
        private Object value;

        public QueryTerm(String expression, String field) {
            this.expression = expression;
            this.field = field;
        }

        private QueryTerm(String expression, String field, Object value) {
            this.expression = expression;
            this.field = field;
            this.value = value;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;

            QueryTerm queryTerm = (QueryTerm) o;

            if (!expression.equals(queryTerm.expression)) return false;
            if (!field.equals(queryTerm.field)) return false;
            return value != null ? value.equals(queryTerm.value) : queryTerm.value == null;

        }

        @Override
        public int hashCode() {
            int result = expression.hashCode();
            result = 31 * result + field.hashCode();
            result = 31 * result + (value != null ? value.hashCode() : 0);
            return result;
        }
    }

    private class OrderTerm {
        private String field;
        private String direction;

        public OrderTerm(String field, String direction) {
            this.field = field;
            this.direction = direction;
        }
    }

    private Set<QueryTerm> queryTerms;
    private List<OrderTerm> orderTerms;

    private EntityManager entityManager;
    private Class<T> rootClass;
    private Integer pageStart;
    private Integer pageSize;

    protected ImmutableQuery(EntityManager entityManager, Class<T> rootClass) {
        this.entityManager = entityManager;
        this.rootClass = rootClass;
        this.queryTerms = new HashSet<>();
        this.orderTerms = new ArrayList<>();
        this.pageSize = 10;
        this.pageStart = 0;
    }

    private ImmutableQuery(ImmutableQuery<T> originalQuery, QueryTerm newTerm) {
        this.entityManager = originalQuery.entityManager;
        this.rootClass = originalQuery.rootClass;
        this.queryTerms = new HashSet<>(originalQuery.queryTerms);
        this.queryTerms.add(newTerm);
        this.orderTerms = new ArrayList<>(originalQuery.orderTerms);
        this.pageSize = originalQuery.pageSize;
        this.pageStart = originalQuery.pageStart;
    }

    private ImmutableQuery(ImmutableQuery<T> originalQuery, Integer pageSize, Integer pageStart) {
        this.entityManager = originalQuery.entityManager;
        this.rootClass = originalQuery.rootClass;
        this.queryTerms = new HashSet<>(originalQuery.queryTerms);
        this.orderTerms = new ArrayList<>(originalQuery.orderTerms);
        this.pageSize = pageSize;
        this.pageStart = pageStart;
    }

    private ImmutableQuery(ImmutableQuery<T> originalQuery, OrderTerm newOrderTerm) {
        this.entityManager = originalQuery.entityManager;
        this.rootClass = originalQuery.rootClass;
        this.queryTerms = new HashSet<>(originalQuery.queryTerms);
        this.orderTerms = new ArrayList<>(originalQuery.orderTerms);
        this.orderTerms.add(newOrderTerm);
        this.pageSize = originalQuery.pageSize;
        this.pageStart = originalQuery.pageStart;
    }

    @Override
    public Query like(String fieldName, Object parameterValue) {
        if (fieldName!= null && parameterValue != null) {
            return new ImmutableQuery<>(this, new QueryTerm("like", fieldName, parameterValue));
        } else {
            return this;
        }
    }

    @Override
    public Query greaterThanOrEqualTo(String fieldName, Object limit) {
        if (fieldName != null && limit != null) {
            return new ImmutableQuery<>(this, new QueryTerm("greaterThanOrEqualTo", fieldName, limit));
        } else {
            return this;
        }
    }

    @Override
    public Query lessThanOrEqualTo(String fieldName, Object limit) {
        if (fieldName != null && limit != null) {
            return new ImmutableQuery<>(this, new QueryTerm("lessThanOrEqualTo", fieldName, limit));
        } else {
            return this;
        }
    }

    @Override
    public Query equal(String fieldName, Object value) {
        if (fieldName != null && value != null) {
            return new ImmutableQuery<>(this, new QueryTerm("equal", fieldName, value));
        } else {
            return this;
        }
    }

    @Override
    public Query has(String fieldName) {
        if (fieldName != null) {
            return new ImmutableQuery<>(this, new QueryTerm("has", fieldName));
        } else {
            return this;
        }
    }

    @Override
    public Query doesNotHave(String fieldName) {
        if (fieldName != null) {
            return new ImmutableQuery<>(this, new QueryTerm("doesNotHave", fieldName));
        } else {
            return this;
        }
    }

    @Override
    public Query pageStart(Integer newPageStart) {
        if (newPageStart != null) {
            return new ImmutableQuery<>(this, this.pageSize, newPageStart);
        } else {
            return this;
        }
    }

    @Override
    public Query pageNumber(Integer pageNr) {
        if (pageNr != null) {
            return new ImmutableQuery<>(this, pageSize, this.pageSize * pageNr);
        } else {
            return this;
        }
    }

    @Override
    public Query pageSize(Integer newPageSize) {
        if (newPageSize != null) {
            return new ImmutableQuery<>(this, newPageSize, this.pageStart);
        } else {
            return this;
        }
    }

    @Override
    public Query asc(String fieldName) {
        if (fieldName != null) {
            return new ImmutableQuery<>(this, new OrderTerm(fieldName, "asc"));
        } else {
            return this;
        }
    }

    @Override
    public Query desc(String fieldName) {
        if (fieldName != null) {
            return new ImmutableQuery<>(this, new OrderTerm(fieldName, "desc"));
        } else {
            return this;
        }
    }

    private Class getFieldClass(Class<T> rootClass, String fieldName) {
        try {
            return rootClass.getDeclaredField(fieldName).getType();
        } catch (NoSuchFieldException e) {
            return null;
        }
    }

    @Override
    public List<T> run() {
        // build query
        CriteriaBuilder criteriaBuilder = entityManager.getCriteriaBuilder();
        CriteriaQuery<T> criteriaQuery = criteriaBuilder.createQuery(rootClass);
        Root<T> root = criteriaQuery.from(rootClass);
        criteriaQuery.select(root);
        Predicate predicate = criteriaBuilder.conjunction();
        List<Expression<Boolean>> expressions = predicate.getExpressions();
        queryTerms.forEach(queryTerm ->
                getExpression(criteriaBuilder, root, queryTerm).ifPresent(expression -> expressions.add(expression)));
        if (expressions.size() > 0) {
            criteriaQuery.where(predicate);
        }
        criteriaQuery.orderBy(orderTerms.stream()
                .map(orderTerm -> getOrder(criteriaBuilder, root, orderTerm))
                .filter(order -> order != null)
                .collect(Collectors.toList())
        );

        TypedQuery<T> typedQuery = entityManager.createQuery(criteriaQuery);
        // set page
        typedQuery.setFirstResult(pageStart);
        typedQuery.setMaxResults(pageSize);
        // populate parameters
        queryTerms.forEach(queryTerm ->
                getParameter(queryTerm).ifPresent(parameter ->
                        typedQuery.setParameter(parameter.getName(), parameter.getValue())
                )
        );
        // run query
        return typedQuery.getResultList();
    }

    private Order getOrder(CriteriaBuilder criteriaBuilder, Root<T> root, OrderTerm orderTerm) {
        switch (orderTerm.direction) {
            case "asc": return criteriaBuilder.asc(root.get(orderTerm.field));
            case "desc": return criteriaBuilder.desc(root.get(orderTerm.field));
            default: return null;
        }
    }

    private class Parameter {
        private String name;
        private Object value;

        public Parameter(String name, Object value) {
            this.name = name;
            this.value = value;
        }

        public String getName() {
            return name;
        }

        public Object getValue() {
            return value;
        }
    }

    private Optional<Parameter> getParameter(QueryTerm queryTerm) {
        switch (queryTerm.expression) {
            case "greaterThanOrEqualTo":
                return Optional.of(new Parameter(queryTerm.field + GTE, queryTerm.value));
            case "lessThanOrEqualTo":
                return Optional.of(new Parameter(queryTerm.field + LTE, queryTerm.value));
            case "has":
            case "doesNotHave":
                return Optional.empty();
            default:
                return Optional.of(new Parameter(queryTerm.field, queryTerm.value));
        }
    }

    private Optional<Expression<Boolean>> getExpression(CriteriaBuilder criteriaBuilder, Root<T> root, QueryTerm queryTerm) {
        switch (queryTerm.expression) {
            case "like":
                return Optional.of(criteriaBuilder.like(root.get(queryTerm.field), getParameter(criteriaBuilder, queryTerm)));
            case "greaterThanOrEqualTo":
                return Optional.of(criteriaBuilder.greaterThanOrEqualTo(root.get(queryTerm.field),getParameter(criteriaBuilder, queryTerm, GTE)));
            case "lessThanOrEqualTo":
                return Optional.of(criteriaBuilder.lessThanOrEqualTo(root.get(queryTerm.field),getParameter(criteriaBuilder, queryTerm, LTE)));
            case "equal":
                return Optional.of(criteriaBuilder.equal(root.get(queryTerm.field),getParameter(criteriaBuilder, queryTerm)));
            case "has":
                return Optional.of(criteriaBuilder.isNotNull(root.get(queryTerm.field)));
            case "doesNotHave":
                return Optional.of(criteriaBuilder.isNull(root.get(queryTerm.field)));
            default:
                return Optional.empty();
        }
    }

    private ParameterExpression getParameter(CriteriaBuilder criteriaBuilder, QueryTerm queryTerm) {
        return getParameter(criteriaBuilder, queryTerm, null);
    }

    private ParameterExpression getParameter(CriteriaBuilder criteriaBuilder, QueryTerm queryTerm, String suffix) {
        if (suffix == null) {
            return criteriaBuilder.parameter(getFieldClass(rootClass, queryTerm.field), queryTerm.field);
        } else {
            return criteriaBuilder.parameter(getFieldClass(rootClass, queryTerm.field), queryTerm.field + suffix);
        }
    }
}
~~~

# Resources

- [Using criteria queries](http://docs.oracle.com/javaee/6/tutorial/doc/gjivm.html)
