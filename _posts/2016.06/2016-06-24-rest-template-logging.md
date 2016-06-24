---
layout: post
title:  'Full logging with RestTemplate'
date:   2016-06-24 14:00:00 BST
tags: ['java', 'rest', 'logging']
---

Being able to fully log all interactions between your code and a REST API can be vital for quickly diagnosing problems in your interaction with the API. The difficulty arises when you realize that most frameworks avoid logging the response body. The response body can only be read once since it is received in stream format. The solution for this is to buffer the stream, that way you can read it for logging and when mapping to Java objects.

The first step, when implementing this, is to correctly instantiate the RestTemplate object:

``` java

@Configuration
@ComponentScan(basePackages = {"com.cacoveanu.service"})
public class ServiceConfig {

    @Autowired
    private RestLogRepository restLogRepository;

    @Bean
    public RestTemplate restTemplate() {
        RestTemplate rest = new RestTemplate();
        rest.getMessageConverters().add(0, mappingJacksonHttpMessageConverter());

        // set up a buffering request factory, so response body is always buffered
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        BufferingClientHttpRequestFactory bufferingClientHttpRequestFactory = new BufferingClientHttpRequestFactory(requestFactory);
        requestFactory.setOutputStreaming(false);
        rest.setRequestFactory(bufferingClientHttpRequestFactory);

        // add the interceptor that will handle logging
        List<ClientHttpRequestInterceptor> interceptors = new ArrayList<ClientHttpRequestInterceptor>();
        interceptors.add(new FullLoggingInterceptor(restLogRepository));
        rest.setInterceptors(interceptors);

        return rest;
    }

    public MappingJackson2HttpMessageConverter mappingJacksonHttpMessageConverter() {
        MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter();
        converter.setObjectMapper(myObjectMapper());
        return converter;
    }

    @Bean
    public ObjectMapper myObjectMapper() {
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.configure(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL, true);
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        return objectMapper;
    }
}
```

The next step is to add the interceptor that handles the actual logging:

``` java
public class FullLoggingInterceptor implements ClientHttpRequestInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(FullLoggingInterceptor.class);

    private RestLogRepository restLogRepository;

    private ObjectMapper mapper = new ObjectMapper();

    private static int MAX_RESULT_SIZE = 524288;

    public FullLoggingInterceptor(RestLogRepository restLogRepository) {
        this.restLogRepository = restLogRepository;
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
        RestLog restLog = new RestLog();
        traceRequest(request, body);
        populate(restLog, request, body);
        Stopwatch stopwatch = new Stopwatch();
        ClientHttpResponse response = null;
        stopwatch.start();
        try {
            response = execution.execute(request, body);
        } catch (Throwable t) {
            getThrowableString(t).ifPresent(restLog::setException);
            throw t;
        } finally {
            stopwatch.stop();
            traceResponse(response);
            populate(restLog, response);
            populate(restLog, stopwatch);
            try {
                restLogRepository.save(restLog);
            } catch (DataAccessException e) {
                logger.error("failed to save REST log to database", e);
            }
        }

        return response;
    }

    private String getBodyAsJson(String bodyString) {
        if (bodyString == null || bodyString.length() == 0) {
            return null;
        } else {
            if (isValidJSON(bodyString)) {
                return bodyString;
            } else {
                bodyString.replaceAll("\"", "\\\"");
                return "\"" + bodyString + "\"";
            }
        }
    }

    private void populate(RestLog restLog, Stopwatch stopwatch) {
        restLog.setCorrelationId(CorrelationId.getId());
        restLog.setStartDate(stopwatch.getStartDate());
        restLog.setEndDate(stopwatch.getStopDate());
        restLog.setDuration(stopwatch.getTime());
    }

    private void populate(RestLog restLog, HttpRequest request, byte[] body) throws IOException {
        restLog.setRequestBody(getRequestBody(body));
        restLog.setRequestUrl(getRequestUrl(request));
        restLog.setRequestType(getRequestType(request));
        restLog.setRequestHeaders(LogUtil.serialize(mapper, getRequestHeaders(request), MAX_RESULT_SIZE));
    }

    private HttpHeaders getRequestHeaders(HttpRequest request) {
        if (request != null) {
            return request.getHeaders();
        } else {
            return null;
        }
    }

    private String getRequestType(HttpRequest request) {
        if (request != null && request.getMethod() != null) {
            return request.getMethod().toString();
        } else {
            return null;
        }
    }

    private String getRequestUrl(HttpRequest request) {
        if (request != null && request.getURI() != null) {
            return request.getURI().toString();
        } else {
            return null;
        }
    }

    private String getRequestBody(byte[] body) throws UnsupportedEncodingException {
        if (body != null && body.length > 0) {
            return getBodyAsJson(new String(body, "UTF-8"));
        } else {
            return null;
        }
    }

    private void traceRequest(HttpRequest request, byte[] body) throws IOException {
        logger.debug("request URI : " + request.getURI());
        logger.debug("request method : " + request.getMethod());
        logger.debug("request body : " + getRequestBody(body));
    }

    private void populate(RestLog restLog, ClientHttpResponse response) throws IOException {
        restLog.setResponseBody(getBodyAsJson(getBodyString(response)));
        restLog.setResponseHeaders(LogUtil.serialize(mapper, getResponseHeaders(response), MAX_RESULT_SIZE));
        restLog.setResponseStatus(getStatusCode(response));
    }

    private HttpHeaders getResponseHeaders(ClientHttpResponse response) {
        if (response != null) {
            return response.getHeaders();
        } else {
            return null;
        }
    }

    private String getStatusCode(ClientHttpResponse response) throws IOException {
        if (response != null && response.getStatusCode() != null) {
            return response.getStatusCode().toString();
        } else {
            return null;
        }
    }

    private void traceResponse(ClientHttpResponse response) throws IOException {
        String body = getBodyString(response);
        logger.debug("response status code: " + response.getStatusCode());
        logger.debug("response status text: " + response.getStatusText());
        logger.debug("response body : " + body);
    }

    private String getBodyString(ClientHttpResponse response) {
        try {
            if (response != null && response.getBody() != null && isReadableResponse(response)) {
                StringBuilder inputStringBuilder = new StringBuilder();
                BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(response.getBody(), "UTF-8"));
                String line = bufferedReader.readLine();
                while (line != null) {
                    inputStringBuilder.append(line);
                    inputStringBuilder.append('\n');
                    line = bufferedReader.readLine();
                }
                return inputStringBuilder.toString();
            } else {
                return null;
            }
        } catch (IOException e) {
            logger.error(e.getMessage(), e);
            return null;
        }
    }

    private boolean isReadableResponse(ClientHttpResponse response) {
        for (String contentType: response.getHeaders().get("Content-Type")) {
            if (isReadableContentType(contentType)) {
                return true;
            }
        }
        return false;
    }

    private boolean isReadableContentType(String contentType) {
        return contentType.startsWith("application/json")
                || contentType.startsWith("text");
    }

    public boolean isValidJSON(final String json) {
        boolean valid = false;
        try {
            final JsonParser parser = new ObjectMapper().getJsonFactory()
                    .createJsonParser(json);
            while (parser.nextToken() != null) {
            }
            valid = true;
        } catch (JsonParseException jpe) {
            // not valid json
        } catch (IOException ioe) {
            // not valid json
        }

        return valid;
    }
}
```

This rather large class is doing several things. The requests and responses are printed to the application logs, but they are also saved to a database as a `RestLog` object using the `RestLogRepository` class. One particularly interesting method in the above code is the `isValidJSON` method, which tries to find out if the request/response body is a JSON or not. If it is not, we convert the request/response body to a JSON string. That way, we can save all data in the database as JSON and then build a simple REST management API for our project that is able to interrogate the logs and return results as JSON.
