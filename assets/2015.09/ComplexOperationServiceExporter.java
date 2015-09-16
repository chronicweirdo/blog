package com.cacoveanu.makeitso.remoting;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.remoting.httpinvoker.HttpInvokerServiceExporter;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * Created by silviu on 2015-09-15.
 */
@Component("/ComplexService")
public class ComplexOperationServiceExporter extends HttpInvokerServiceExporter {

    @Autowired
    private ComplexOperationService complexOperationService;

    public void setComplexOperationService(ComplexOperationService complexOperationService) {
        this.complexOperationService = complexOperationService;
    }

    @PostConstruct
    public void init() {
        this.setService(complexOperationService);
        this.setServiceInterface(ComplexOperationService.class);
        System.out.println("finished initializing service exporter");
    }
}
