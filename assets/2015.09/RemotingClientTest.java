package com.cacoveanu.makeitso.remoting;

import org.junit.Assert;
import org.junit.Test;
import org.springframework.remoting.httpinvoker.HttpInvokerProxyFactoryBean;

/**
 * Created by scacoveanu on 16/9/2015.
 */
public class RemotingClientTest {

    private static final String SERVICE_URL = "http://localhost:8087/ComplexService";

    @Test
    public void testSayHelloProgramatic() throws Exception {
        HttpInvokerProxyFactoryBean proxyFactoryBean = new HttpInvokerProxyFactoryBean();
        proxyFactoryBean.setServiceUrl(SERVICE_URL);
        proxyFactoryBean.setServiceInterface(ComplexOperationService.class);
        proxyFactoryBean.afterPropertiesSet();

        ComplexOperationService complexOperationService = (ComplexOperationService) proxyFactoryBean.getObject();
        String hello = complexOperationService.sayHello("John");
        Assert.assertNotNull(hello);
        System.out.println("sayHello: " + hello);
    }

    @Test
    public void testCancelComplexOperation() throws Exception {
        HttpInvokerProxyFactoryBean proxyFactoryBean = new HttpInvokerProxyFactoryBean();
        proxyFactoryBean.setServiceUrl(SERVICE_URL);
        proxyFactoryBean.setServiceInterface(ComplexOperationService.class);
        proxyFactoryBean.afterPropertiesSet();
        ComplexOperationService complexOperationService = (ComplexOperationService) proxyFactoryBean.getObject();

        Thread operationCallThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Long result = complexOperationService.complexOperation(0L);
                    System.out.println("remote complex operation result = " + result);
                } catch (InterruptedException e) {
                    System.out.println("remote complex operation was canceled");
                }
            }
        });

        operationCallThread.start();
        Thread.sleep(5000);
        complexOperationService.cancelComplexOperation();
        operationCallThread.join();
    }
}
